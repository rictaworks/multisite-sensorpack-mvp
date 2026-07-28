import {
  listMockSites,
  listMockDevices,
  getMockDeviceDetail,
  listMockCommands,
  listMockAlerts,
  getMockTelemetrySeries,
} from '../../lib/dashboard/mockData';

/**
 * Issue #18 (F6 dashboard) ships against the real OpenAPI contract shapes
 * (src/shared/contracts/openapi.yaml) but the actual Rails API integration is
 * out of scope (later issue) — see the issue's Edit scope. These stubs must
 * still honor the contract's field names/types so swapping in a real fetch()
 * later is a drop-in replacement.
 */
describe('dashboard mock data (contract-shaped stub, real Rails wiring is a later issue)', () => {
  it('lists at least two sites with the aggregate fields the Site schema requires', () => {
    const sites = listMockSites();
    expect(sites.length).toBeGreaterThanOrEqual(2);
    sites.forEach((site) => {
      expect(typeof site.id).toBe('number');
      expect(typeof site.name).toBe('string');
      expect(typeof site.deviceCount).toBe('number');
      expect(typeof site.onlineDeviceCount).toBe('number');
      expect(typeof site.openAlertCount).toBe('number');
      expect(typeof site.createdAt).toBe('string');
    });
  });

  it('lists devices for a given site and includes at least one offline device across all sites', () => {
    const sites = listMockSites();
    const allDevices = sites.flatMap((site) => listMockDevices(site.id));
    expect(allDevices.length).toBeGreaterThanOrEqual(2);
    allDevices.forEach((device) => {
      expect(['provisioning', 'online', 'offline']).toContain(device.status);
    });
    expect(allDevices.some((device) => device.status === 'offline')).toBe(true);

    const firstSite = sites[0];
    listMockDevices(firstSite.id).forEach((device) => {
      expect(device.siteId).toBe(firstSite.id);
    });
  });

  it('returns device detail with thresholds for a known device id, undefined for an unknown one', () => {
    const [device] = listMockDevices(listMockSites()[0].id);
    const detail = getMockDeviceDetail(device.id);
    expect(detail).toBeDefined();
    expect(detail?.thresholds.length).toBeGreaterThan(0);
    expect(getMockDeviceDetail(-1)).toBeUndefined();
  });

  it('returns command history ordered most-recent first', () => {
    const [device] = listMockDevices(listMockSites()[0].id);
    const commands = listMockCommands(device.id);
    expect(commands.length).toBeGreaterThan(0);
    commands.forEach((command) => expect(command.deviceId).toBe(device.id));
    const timestamps = commands.map((c) => new Date(c.issuedAt).getTime());
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });

  it('returns alerts, optionally filtered by deviceId', () => {
    const allAlerts = listMockAlerts();
    expect(allAlerts.length).toBeGreaterThan(0);
    const [device] = listMockDevices(listMockSites()[0].id);
    listMockAlerts(device.id).forEach((alert) => expect(alert.deviceId).toBe(device.id));
  });

  it('returns a telemetry series with the point count matching the requested range and includes thresholds', () => {
    const [device] = listMockDevices(listMockSites()[0].id);
    const day = getMockTelemetrySeries(device.id, '24h', 'temperature');
    const week = getMockTelemetrySeries(device.id, '7d', 'temperature');
    expect(day.points.length).toBeGreaterThan(0);
    expect(week.points.length).toBeGreaterThan(day.points.length);
    day.points.forEach((point) => {
      expect(typeof point.timestamp).toBe('string');
      expect(point.isAggregated).toBe(false);
    });
    week.points.forEach((point) => {
      expect(point.isAggregated).toBe(true);
    });
    expect(day.thresholds.every((t) => t.sensorType === 'temperature')).toBe(true);
  });

  it('is deterministic across repeated calls (stable fixtures for tests/UI, not Math.random)', () => {
    const [device] = listMockDevices(listMockSites()[0].id);
    const first = getMockTelemetrySeries(device.id, '24h', 'temperature');
    const second = getMockTelemetrySeries(device.id, '24h', 'temperature');
    expect(first).toEqual(second);
  });
});
