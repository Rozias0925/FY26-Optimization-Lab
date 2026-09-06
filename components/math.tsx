import katex from 'katex';

export function MathFormula({
  children,
  display = false,
  className = '',
}: {
  children: string;
  display?: boolean;
  className?: string;
}) {
  const markup = katex.renderToString(children, {
    displayMode: display,
    throwOnError: false,
    strict: false,
  });

  return (
    <span
      className={`${display ? 'block overflow-x-auto overflow-y-hidden py-1' : 'inline-block'} ${className}`}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
