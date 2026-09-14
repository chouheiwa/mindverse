import guide from '../assets/kanshan/guide.webp'
import analyze from '../assets/kanshan/analyze.webp'
import discover from '../assets/kanshan/discover.webp'
import './KanshanIcon.css'

const icons = { guide, analyze, discover }

/** Decorative companion; adjacent text carries all actions and status. */
export function KanshanIcon({ variant, size = 80, className = '' }: {
  variant: keyof typeof icons
  size?: number
  className?: string
}) {
  return <img className={`kanshan-icon ${className}`} src={icons[variant]}
    width={size} height={size} alt="" aria-hidden="true" draggable={false} decoding="async" />
}
