import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

type AlertDialogContextValue = {
  close: () => void;
  titleId: string;
  descriptionId: string;
};

const AlertDialogContext = createContext<AlertDialogContextValue | null>(null);

function useAlertDialogContext() {
  const context = useContext(AlertDialogContext);
  if (!context) {
    throw new Error("AlertDialog components must be used inside AlertDialog");
  }
  return context;
}

export function AlertDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();

  if (!open) return null;

  return (
    <AlertDialogContext.Provider
      value={{
        close: () => onOpenChange(false),
        titleId,
        descriptionId,
      }}
    >
      {children}
    </AlertDialogContext.Provider>
  );
}

export function AlertDialogContent({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { titleId, descriptionId } = useAlertDialogContext();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#122232]/70 p-4">
      <div
        ref={contentRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`grid w-full max-w-lg gap-4 rounded-lg border bg-white p-6 shadow-xl ${className}`}
        {...props}
      />
    </div>
  );
}

export function AlertDialogHeader({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex flex-col space-y-2 text-left ${className}`} {...props} />;
}

export function AlertDialogFooter({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex flex-col-reverse gap-2 sm:flex-row sm:justify-end ${className}`} {...props} />;
}

export const AlertDialogTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className = "", ...props }, ref) => {
  const { titleId } = useAlertDialogContext();
  return (
    <h2
      ref={ref}
      id={titleId}
      className={`text-lg font-semibold ${className}`}
      {...props}
    />
  );
});
AlertDialogTitle.displayName = "AlertDialogTitle";

export const AlertDialogDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className = "", ...props }, ref) => {
  const { descriptionId } = useAlertDialogContext();
  return (
    <p
      ref={ref}
      id={descriptionId}
      className={`text-sm text-[#65737d] ${className}`}
      {...props}
    />
  );
});
AlertDialogDescription.displayName = "AlertDialogDescription";

function AlertDialogButton({
  className = "",
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { close } = useAlertDialogContext();
  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) close();
      }}
      {...props}
    />
  );
}

export const AlertDialogAction = AlertDialogButton;
export const AlertDialogCancel = AlertDialogButton;