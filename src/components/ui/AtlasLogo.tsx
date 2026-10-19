import { LOGO_BOX, STUDIOS_LETTERS, WORDMARK_LETTERS } from '@/components/hero/geometry';

type AtlasLogoProps = {
  className?: string;
  /** The wordmark's colour and the descriptor's (both follow the text colour unless set). */
  mark?: string;
  studios?: string;
  /**
   * Extra weight for “STUDIOS”, in screen pixels: its hairlines are a ninth of the
   * wordmark's stems, so a small lockup (the header's) thickens them to stay legible.
   */
  weight?: number;
  /** The lockup's accessible name; empty when the text beside it already says it. */
  title?: string;
};

/**
 * The Atlas Studios logo: the wordmark above “STUDIOS”, drawn from the same
 * vectors as the landing's wordmark, in whatever colour the text around it is.
 */
export function AtlasLogo({ className, mark = 'currentColor', studios = 'currentColor', weight = 0, title = 'Atlas Studios' }: AtlasLogoProps) {
  return (
    <svg
      viewBox={`${LOGO_BOX.x} ${LOGO_BOX.y} ${LOGO_BOX.width} ${LOGO_BOX.height}`}
      className={className}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <g fill={mark}>
        {WORDMARK_LETTERS.map((letter) => (
          <path key={letter.id} d={letter.d} />
        ))}
      </g>
      <g fill={studios} fillRule="evenodd">
        {STUDIOS_LETTERS.map((letter) => (
          <path
            key={letter.id}
            d={letter.d}
            {...(weight > 0 && { stroke: studios, strokeWidth: weight, strokeLinejoin: 'round' as const, vectorEffect: 'non-scaling-stroke' })}
          />
        ))}
      </g>
    </svg>
  );
}
