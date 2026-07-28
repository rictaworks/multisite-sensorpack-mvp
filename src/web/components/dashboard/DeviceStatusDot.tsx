import type { components } from '@contracts/api';

type DeviceStatus = components['schemas']['DeviceStatus'];

const STATUS_COLOR: Record<DeviceStatus, string> = {
  online: '#1e8e3e',
  offline: '#e5484d',
  provisioning: '#6b82a0',
};

/** Small colored status indicator shared by the site overview device rows and the device detail header. */
export default function DeviceStatusDot({ status }: { status: DeviceStatus }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 9,
        height: 9,
        borderRadius: '50%',
        background: STATUS_COLOR[status],
        flex: 'none',
      }}
    />
  );
}
