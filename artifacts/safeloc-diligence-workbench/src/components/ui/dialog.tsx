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
import { X } from "lucide-react";

type DialogContextValue = {
  close: () => void;
  titleId: string;
  descriptionId: string;
};

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = useContext(DialogContext);
  if (!context) throw new Error("Dialog components must be used inside Dialog");
  return context;
}

export function Dialog({
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
    <DialogContext.Provider
      value={{
        close: () => onOpenChange(false),
        titleId,
        descriptionId,
      }}
    >
      {children}
    </DialogContext.Provider>
  );
}

export function DialogContent({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { close, titleId, descriptionId } = useDialogContext();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contentRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#122232]/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`relative grid max-h-[85vh] w-full max-w-lg gap-4 overflow-y-auto rounded-lg border bg-white p-6 shadow-xl ${className}`}
        {...props}
      >
        {children}
        <button
          type="button"
          aria-label="Close dialog"
          onClick={close}
          className="absolute right-4 top-4 rounded p-1 text-[#65737d] hover:bg-[#eef2f1] hover:text-[#122232]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function DialogHeader({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex flex-col space-y-1.5 text-left ${className}`} {...props} />;
}

export function DialogFooter({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex flex-col-reverse gap-2 sm:flex-row sm:justify-end ${className}`} {...props} />;
}

export const DialogTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className = "", ...props }, ref) => {
  const { titleId } = useDialogContext();
  return (
    <h2
      ref={ref}
      id={titleId}
      className={`text-lg font-semibold leading-none tracking-tight ${className}`}
      {...props}
    />
  );
});
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className = "", ...props }, ref) => {
  const { descriptionId } = useDialogContext();
  return (
    <p
      ref={ref}
      id={descriptionId}
      className={`text-sm text-[#65737d] ${className}`}
      {...props}
    />
  );
});
DialogDescription.displayName = "DialogDescription";

export function DialogClose({
  className = "",
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { close } = useDialogContext();
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