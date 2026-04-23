import { cn } from '@/lib/utils';
import type { AttendanceStatus, StaffAttendanceStatus } from '@/lib/constants/enums';
import { getAttendanceStatusInfo } from '@/lib/services/attendanceEngine';
import { getStaffStatusInfo } from '@/lib/services/staffAttendanceEngine';

interface StatusBadgeProps {
  status: AttendanceStatus | string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const info = getAttendanceStatusInfo(status);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium border',
        info.bg,
        info.color,
        info.border,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        status === 'kritik' && 'animate-blink'
      )}
    >
      {info.label}
    </span>
  );
}

interface StaffStatusBadgeProps {
  status: StaffAttendanceStatus | string;
  size?: 'sm' | 'md';
}

export function StaffStatusBadge({ status, size = 'md' }: StaffStatusBadgeProps) {
  const info = getStaffStatusInfo(status);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium border',
        info.bg,
        info.color,
        info.border,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      )}
    >
      {info.label}
    </span>
  );
}
