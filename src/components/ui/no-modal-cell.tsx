"use client";

/**
 * A <td> that stops a click from bubbling up to a CostRow's row-click handler — for
 * action buttons/forms inside an otherwise-clickable row. Needs to be its own Client
 * Component: a Server Component can pass plain JSX into a Client Component's children,
 * but can't attach a function prop (onClick) to an element it renders itself.
 */
export function NoModalCell({ children, className, colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td className={className} colSpan={colSpan} onClick={(event) => event.stopPropagation()}>
      {children}
    </td>
  );
}
