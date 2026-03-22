import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

const MetricCard = ({ 
  title, 
  value, 
  icon: Icon, 
  trend,
  variant = 'default',
  className 
}: MetricCardProps) => {
  const variantStyles = {
    default: 'border-border/50',
    success: 'border-success/30 bg-success/5',
    warning: 'border-warning/30 bg-warning/5',
    danger: 'border-destructive/30 bg-destructive/5',
  };

  const iconVariantStyles = {
    default: 'text-primary bg-primary/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10',
    danger: 'text-destructive bg-destructive/10',
  };

  const glowColors = {
    default: 'rgba(30, 79, 163, 0.15)',
    success: 'rgba(34, 197, 94, 0.15)',
    warning: 'rgba(234, 179, 8, 0.15)',
    danger: 'rgba(239, 68, 68, 0.15)',
  };

  return (
    <motion.div 
      className={cn('metric-card relative overflow-hidden', variantStyles[variant], className)}
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      whileHover={{ 
        scale: 1.02,
        transition: { duration: 0.2 }
      }}
    >
      {/* Ambient glow */}
      <motion.div
        className="absolute -top-10 -right-10 w-24 h-24 rounded-full opacity-0"
        style={{
          background: `radial-gradient(circle, ${glowColors[variant]} 0%, transparent 70%)`,
          filter: 'blur(20px)',
        }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />

      {/* Top border glow */}
      <div 
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${glowColors[variant].replace('0.15', '0.4')}, transparent)`,
        }}
      />

      <div className="flex items-start justify-between relative z-10">
        <div className="flex-1 min-w-0">
          <p className="metric-label truncate">{title}</p>
          <motion.p 
            className="metric-value mt-2 text-xl sm:text-2xl lg:text-3xl"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            {value}
          </motion.p>
          
          {trend && (
            <motion.div 
              className={cn(
                trend.isPositive ? 'metric-trend-up' : 'metric-trend-down',
                'mt-2 text-xs sm:text-sm'
              )}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            >
              {trend.isPositive ? (
                <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
              ) : (
                <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />
              )}
              <span>{trend.isPositive ? '+' : ''}{trend.value}% este mês</span>
            </motion.div>
          )}
        </div>
        
        <motion.div 
          className={cn('p-2 sm:p-3 rounded-xl flex-shrink-0', iconVariantStyles[variant])}
          whileHover={{ 
            scale: 1.1,
            rotate: 5,
          }}
          transition={{ duration: 0.2 }}
        >
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        </motion.div>
      </div>
    </motion.div>
  );
};

export default MetricCard;
