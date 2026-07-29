require "rails_helper"
require "rack/mock"
require Rails.root.join("lib/production_security")

# Issue #53 A-1 / A-3: 本番のトランスポート層セキュリティ設定の検証。
#
# config/environments/production.rb は test 環境では読み込まれないため、production.rb が
# 実際に組み立てる設定値を ProductionSecurity モジュールへ切り出し、そのモジュールと、
# その値で構成した Rails 標準ミドルウェア(ActionDispatch::SSL / HostAuthorization /
# RemoteIp)の振る舞いを検証する。
#
# 「設定ファイルにその行が書かれていること」ではなく「その設定でリクエストがどう扱われるか」
# を検証対象にしている(設定を書き換えたときに意図した防御が壊れたことを検知するため)。
RSpec.describe ProductionSecurity do
  # レスポンスの中身は検証対象ではないため、常に200を返すだけのRackアプリを終端に置く。
  let(:terminal_app) { ->(_env) { [ 200, { "content-type" => "text/plain" }, [ "ok" ] ] } }

  describe ".allowed_hosts" do
    it "カンマ区切りの環境変数を配列に分解し、前後の空白を取り除く" do
      hosts = described_class.allowed_hosts(
        env: { described_class::ALLOWED_HOSTS_ENV => "sensorpack-api.rictaworks.jp, .rictaworks.jp" }
      )

      expect(hosts).to eq([ "sensorpack-api.rictaworks.jp", ".rictaworks.jp" ])
    end

    # 未設定のまま起動を許すとHostヘッダ検証が無効(config.hosts = [])になり、
    # DNSリバインディング防御が消える。フォールバックせず起動を止める。
    it "未設定の場合はConfigurationErrorを送出する(fail closed)" do
      expect { described_class.allowed_hosts(env: {}) }
        .to raise_error(described_class::ConfigurationError, /#{described_class::ALLOWED_HOSTS_ENV}/)
    end

    it "空文字・カンマのみの場合もConfigurationErrorを送出する" do
      expect { described_class.allowed_hosts(env: { described_class::ALLOWED_HOSTS_ENV => " , " }) }
        .to raise_error(described_class::ConfigurationError)
    end
  end

  describe ".trusted_proxies" do
    it "カンマ区切りのCIDRをIPAddrへ変換し、Rails既定の信頼プロキシに追加する" do
      proxies = described_class.trusted_proxies(
        env: { described_class::TRUSTED_PROXY_IPS_ENV => "100.64.0.0/10" }
      )

      expect(proxies).to include(IPAddr.new("100.64.0.0/10"))
      # 既定を「置き換える」とプラットフォーム内部の私設IPが信頼されなくなるため、
      # 既定値が残っていることも保証する。
      expect(proxies).to include(*ActionDispatch::RemoteIp::TRUSTED_PROXIES)
    end

    it "未設定の場合はnilを返しRails既定の信頼プロキシ集合を使う" do
      expect(described_class.trusted_proxies(env: {})).to be_nil
    end

    it "IP/CIDRとして解釈できない値はConfigurationErrorを送出する(誤設定の握りつぶし禁止)" do
      expect { described_class.trusted_proxies(env: { described_class::TRUSTED_PROXY_IPS_ENV => "not-an-ip" }) }
        .to raise_error(described_class::ConfigurationError, /not-an-ip/)
    end
  end

  describe "HTTPS強制(ActionDispatch::SSL)" do
    subject(:middleware) do
      ActionDispatch::SSL.new(
        terminal_app,
        redirect: { exclude: described_class.health_check_exclusion }
      )
    end

    def get(path, host: "sensorpack-api.rictaworks.jp", scheme: "http")
      middleware.call(Rack::MockRequest.env_for("#{scheme}://#{host}#{path}"))
    end

    it "平文HTTPのリクエストをHTTPSへリダイレクトする" do
      status, headers, _body = get("/api/v1/devices")

      expect(status).to eq(301)
      expect(headers["location"]).to start_with("https://")
    end

    it "HTTPSのリクエストにはHSTS(Strict-Transport-Security)を付与する" do
      _status, headers, _body = get("/api/v1/devices", scheme: "https")

      expect(headers["strict-transport-security"]).to be_present
    end

    # Railwayのヘルスチェックは平文HTTPで来る可能性があり、301を返すと監視が落ちる。
    ProductionSecurity::HEALTH_CHECK_PATHS.each do |path|
      it "ヘルスチェックパス #{path} はHTTPSリダイレクトの対象外" do
        status, _headers, _body = get(path)

        expect(status).to eq(200)
      end
    end
  end

  describe "Hostヘッダ検証(ActionDispatch::HostAuthorization)" do
    subject(:middleware) do
      ActionDispatch::HostAuthorization.new(
        terminal_app,
        described_class.allowed_hosts(env: { described_class::ALLOWED_HOSTS_ENV => allowed }),
        exclude: described_class.health_check_exclusion
      )
    end

    let(:allowed) { "sensorpack-api.rictaworks.jp" }

    # ActionDispatch::HostAuthorization は HTTP_HOST ヘッダを検証対象にする。
    # Rack::MockRequest.env_for は HTTP_HOST を組み立てないため、実リクエストと同じ状態を
    # 作るために明示的に与える(これが無いとHost未指定として一律403になり、
    # 「許可Hostが通ること」を検証できない)。
    def get(path, host:)
      middleware.call(Rack::MockRequest.env_for("https://#{host}#{path}", "HTTP_HOST" => host))
    end

    it "許可されたHostのリクエストは通す" do
      status, _headers, _body = get("/api/v1/devices", host: "sensorpack-api.rictaworks.jp")

      expect(status).to eq(200)
    end

    it "許可されていないHost(DNSリバインディング)のリクエストを拒否する" do
      status, _headers, _body = get("/api/v1/devices", host: "attacker.example.com")

      expect(status).to eq(403)
    end

    context "先頭がドットのエントリを設定した場合" do
      let(:allowed) { ".rictaworks.jp" }

      it "サブドメインを許可する" do
        status, _headers, _body = get("/api/v1/devices", host: "sensorpack-api.rictaworks.jp")

        expect(status).to eq(200)
      end

      it "別ドメインは許可しない" do
        status, _headers, _body = get("/api/v1/devices", host: "rictaworks.jp.attacker.example.com")

        expect(status).to eq(403)
      end
    end

    ProductionSecurity::HEALTH_CHECK_PATHS.each do |path|
      it "ヘルスチェックパス #{path} はHost検証の対象外(プラットフォーム内部Hostで到達する)" do
        status, _headers, _body = get(path, host: "healthcheck.railway.internal")

        expect(status).to eq(200)
      end
    end
  end

  # Issue #53 A-3: ClaimDeviceService / Api::ClaimCodesController は request.remote_ip で
  # レート制限をかけている。X-Forwarded-For を偽装するだけでIP単位の制限をすり抜けられると
  # 未認証エンドポイント(デバイスクレーム)の総当たり対策が無効化される。
  describe "クライアントIP判定(ActionDispatch::RemoteIp)" do
    # リバースプロキシ配下を模した環境。REMOTE_ADDR はプラットフォーム内部のプロキシIPで、
    # X-Forwarded-For の末尾にプロキシが観測した実クライアントIPが積まれる。
    def remote_ip_for(forwarded_for:, remote_addr: "10.0.0.7", trusted_proxies: nil)
      captured = nil
      app = ActionDispatch::RemoteIp.new(
        ->(env) { captured = ActionDispatch::Request.new(env).remote_ip; [ 200, {}, [ "ok" ] ] },
        true,
        trusted_proxies
      )
      env = Rack::MockRequest.env_for(
        "https://sensorpack-api.rictaworks.jp/api/v1/devices/claim",
        "REMOTE_ADDR" => remote_addr,
        "HTTP_X_FORWARDED_FOR" => forwarded_for
      )
      app.call(env)
      captured
    end

    it "プロキシが積んだ実クライアントIPをレート制限のキーとして採用する" do
      expect(remote_ip_for(forwarded_for: "203.0.113.10")).to eq("203.0.113.10")
    end

    # 攻撃者が任意のIPを先頭に差し込んでも、プロキシが末尾に積む実IPが採用される。
    it "偽装したX-Forwarded-Forの値を採用せず、実クライアントIPを返す" do
      client_ip = remote_ip_for(forwarded_for: "1.2.3.4, 203.0.113.10")

      expect(client_ip).to eq("203.0.113.10")
      expect(client_ip).not_to eq("1.2.3.4")
    end

    it "偽装値を変えてもレート制限のキーが変わらない(IPを詐称した回避が成立しない)" do
      keys = [ "1.2.3.4", "5.6.7.8", "9.9.9.9" ].map do |spoofed|
        remote_ip_for(forwarded_for: "#{spoofed}, 203.0.113.10")
      end

      expect(keys.uniq).to eq([ "203.0.113.10" ])
    end

    context "TRUSTED_PROXY_IPS でプラットフォームのプロキシレンジを明示した場合" do
      let(:proxies) do
        described_class.trusted_proxies(env: { described_class::TRUSTED_PROXY_IPS_ENV => "100.64.0.0/10" })
      end

      it "信頼プロキシのIPはクライアントIPとして採用されない" do
        client_ip = remote_ip_for(
          forwarded_for: "203.0.113.10, 100.64.1.1",
          remote_addr: "100.64.0.1",
          trusted_proxies: proxies
        )

        expect(client_ip).to eq("203.0.113.10")
      end

      it "既定の信頼プロキシ(プライベートIP)も引き続き信頼される" do
        client_ip = remote_ip_for(
          forwarded_for: "203.0.113.10, 10.0.0.7",
          remote_addr: "10.0.0.7",
          trusted_proxies: proxies
        )

        expect(client_ip).to eq("203.0.113.10")
      end
    end
  end
end
