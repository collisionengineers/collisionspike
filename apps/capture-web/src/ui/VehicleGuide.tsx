import type { ReactElement } from 'react';

interface VehicleGuideProps {
  activePercent: number;
}

export function VehicleGuide({ activePercent }: VehicleGuideProps): ReactElement {
  const clamped = Math.max(0, Math.min(100, activePercent));
  return (
    <div className="vehicle-guide" aria-hidden="true">
      <svg viewBox="0 0 360 220">
        <path
          className="bay"
          d="M24 174C42 98 89 58 180 54c91 4 138 44 156 120"
          fill="none"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          className="sweep"
          d="M24 174C42 98 89 58 180 54c91 4 138 44 156 120"
          fill="none"
          strokeWidth="18"
          strokeLinecap="round"
          strokeDasharray={`${clamped * 3.2} 420`}
        />
        <path
          d="M71 139h31l39-58c7-10 18-16 30-16h40c12 0 23 6 30 16l39 58h23c15 0 27 12 27 27v16H42v-14c0-16 13-29 29-29Z"
          fill="#f6f8f7"
          stroke="#18202a"
          strokeWidth="7"
          strokeLinejoin="round"
        />
        <path d="M142 92h85l31 47H111l31-47Z" fill="#f1f0ee" stroke="#2c2a27" strokeWidth="7" />
        <circle cx="105" cy="183" r="25" fill="#2c2a27" />
        <circle cx="276" cy="183" r="25" fill="#2c2a27" />
        <rect x="151" y="150" width="66" height="22" rx="2" fill="#db0816" />
      </svg>
    </div>
  );
}
