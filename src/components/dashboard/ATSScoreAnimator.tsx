import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle, AlertTriangle, XCircle, TrendingUp, Star } from 'lucide-react';

interface ATSScoreAnimatorProps {
  score: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  className?: string;
}

interface ScoreLevel {
  label: string;
  colorClass: string;
  strokeColor: string;
  glowColor: string;
  icon: React.ReactNode;
}

const SIZES = {
  sm: { container: 96, stroke: 6, fontSize: 'text-lg', labelSize: 'text-[10px]', iconSize: 14 },
  md: { container: 144, stroke: 8, fontSize: 'text-2xl', labelSize: 'text-xs', iconSize: 16 },
  lg: { container: 192, stroke: 10, fontSize: 'text-4xl', labelSize: 'text-sm', iconSize: 20 },
} as const;

const ANIMATION_DURATION_MS = 1400;

function easeOutQuart(progress: number): number {
  return 1 - Math.pow(1 - progress, 4);
}

function getScoreLevel(score: number): ScoreLevel {
  if (score >= 95) {
    return {
      label: 'Excellent',
      colorClass: 'text-green-500',
      strokeColor: '#22c55e',
      glowColor: 'rgba(34, 197, 94, 0.4)',
      icon: <Star />,
    };
  }
  if (score >= 90) {
    return {
      label: 'Great',
      colorClass: 'text-green-500',
      strokeColor: '#22c55e',
      glowColor: 'rgba(34, 197, 94, 0.35)',
      icon: <CheckCircle />,
    };
  }
  if (score >= 80) {
    return {
      label: 'Good',
      colorClass: 'text-blue-500',
      strokeColor: '#3b82f6',
      glowColor: 'rgba(59, 130, 246, 0.3)',
      icon: <TrendingUp />,
    };
  }
  if (score >= 70) {
    return {
      label: 'Fair',
      colorClass: 'text-orange-500',
      strokeColor: '#f97316',
      glowColor: 'rgba(249, 115, 22, 0.3)',
      icon: <AlertTriangle />,
    };
  }
  return {
    label: 'Needs Work',
    colorClass: 'text-red-500',
    strokeColor: '#ef4444',
    glowColor: 'rgba(239, 68, 68, 0.3)',
    icon: <XCircle />,
  };
}

export function ATSScoreAnimator({
  score,
  label,
  size = 'md',
  animate = true,
  className,
}: ATSScoreAnimatorProps) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const [displayedScore, setDisplayedScore] = useState(animate ? 0 : clampedScore);
  const [strokeProgress, setStrokeProgress] = useState(animate ? 0 : clampedScore / 100);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const { container, stroke, fontSize, labelSize, iconSize } = SIZES[size];
  const radius = (container - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = container / 2;

  const level = getScoreLevel(clampedScore);
  const showGlow = clampedScore >= 90;

  const animateScore = useCallback(
    (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const rawProgress = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
      const easedProgress = easeOutQuart(rawProgress);

      const currentScore = Math.round(easedProgress * clampedScore);
      setDisplayedScore(currentScore);
      setStrokeProgress(easedProgress * (clampedScore / 100));

      if (rawProgress < 1) {
        animationRef.current = requestAnimationFrame(animateScore);
      }
    },
    [clampedScore],
  );

  useEffect(() => {
    if (!animate) {
      setDisplayedScore(clampedScore);
      setStrokeProgress(clampedScore / 100);
      return;
    }

    setDisplayedScore(0);
    setStrokeProgress(0);
    startTimeRef.current = null;
    animationRef.current = requestAnimationFrame(animateScore);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [clampedScore, animate, animateScore]);

  const dashOffset = circumference * (1 - strokeProgress);

  return (
    <div
      className={cn('inline-flex flex-col items-center gap-2', className)}
      role="meter"
      aria-valuenow={clampedScore}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `ATS Score: ${clampedScore}%`}
    >
      <div className="relative" style={{ width: container, height: container }}>
        {/* Pulsing glow for high scores */}
        {showGlow && (
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{
              boxShadow: `0 0 20px 4px ${level.glowColor}`,
              animationDuration: '2s',
            }}
          />
        )}

        <svg
          width={container}
          height={container}
          viewBox={`0 0 ${container} ${container}`}
          className="rotate-[-90deg]"
        >
          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-muted-foreground/15"
          />

          {/* Score arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={level.strokeColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: animate ? 'none' : 'stroke-dashoffset 0.5s ease-out' }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('font-bold tabular-nums', fontSize, level.colorClass)}>
            {displayedScore}
            <span className={cn('font-semibold', size === 'sm' ? 'text-xs' : 'text-base')}>%</span>
          </span>
          <div className={cn('flex items-center gap-1 mt-0.5', labelSize, level.colorClass)}>
            {React.cloneElement(level.icon as React.ReactElement, {
              size: iconSize,
              className: 'shrink-0',
            })}
            <span className="font-medium">{level.label}</span>
          </div>
        </div>
      </div>

      {label && (
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      )}
    </div>
  );
}

ATSScoreAnimator.displayName = 'ATSScoreAnimator';
