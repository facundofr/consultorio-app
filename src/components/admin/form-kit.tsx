"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { createContext, useActionState, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type FormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string | string[]>;
  seq?: number;
};

type Ctx = { state: FormState };
const FormCtx = createContext<Ctx>({ state: {} });
const useFormCtx = () => useContext(FormCtx);

/**
 * Form bound to a server action. Keeps the user's input on errors (the form
 * remounts with the returned values), shows field errors, toasts success.
 */
export function ActionForm({
  action,
  children,
  className,
  successToast = true,
  onSuccess,
  readOnly = false,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  successToast?: boolean;
  onSuccess?: (state: FormState) => void;
  /** Render the fields disabled (e.g. staff viewing the catalog). */
  readOnly?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const lastSeq = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!state.seq || state.seq === lastSeq.current) return;
    lastSeq.current = state.seq;
    if (state.ok) {
      if (successToast && state.message) toast.success(state.message);
      onSuccess?.(state);
    }
  }, [state, successToast, onSuccess]);

  return (
    <FormCtx.Provider value={{ state }}>
      <form key={state.seq ?? 0} action={formAction} className={cn("flex flex-col gap-5", className)} noValidate>
        {state.ok === false && state.message ? (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-alerta-claro px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{state.message}</span>
          </div>
        ) : null}
        <fieldset disabled={readOnly} className="contents">
          {children}
        </fieldset>
      </form>
    </FormCtx.Provider>
  );
}

function useFieldValue(name: string, fallback?: string | string[] | null) {
  const { state } = useFormCtx();
  const v = state.values?.[name];
  return v !== undefined ? v : (fallback ?? undefined);
}

export function FieldShell({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type BaseFieldProps = { name: string; label: ReactNode; hint?: ReactNode; className?: string; required?: boolean };

export function TextField({
  name,
  label,
  hint,
  className,
  defaultValue,
  required,
  ...rest
}: BaseFieldProps & Omit<React.ComponentProps<"input">, "name" | "defaultValue"> & { defaultValue?: string | number | null }) {
  const id = useId();
  const { state } = useFormCtx();
  const error = state.fieldErrors?.[name];
  const value = useFieldValue(name, defaultValue === null || defaultValue === undefined ? undefined : String(defaultValue));
  return (
    <FieldShell id={id} label={<>{label}{required ? <span className="text-destructive"> *</span> : null}</>} hint={hint} error={error} className={className}>
      <Input
        id={id}
        name={name}
        defaultValue={value as string | undefined}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        required={required}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  name,
  label,
  hint,
  className,
  defaultValue,
  required,
  ...rest
}: BaseFieldProps & Omit<React.ComponentProps<"textarea">, "name" | "defaultValue"> & { defaultValue?: string | null }) {
  const id = useId();
  const { state } = useFormCtx();
  const error = state.fieldErrors?.[name];
  const value = useFieldValue(name, defaultValue ?? undefined);
  return (
    <FieldShell id={id} label={<>{label}{required ? <span className="text-destructive"> *</span> : null}</>} hint={hint} error={error} className={className}>
      <Textarea id={id} name={name} defaultValue={value as string | undefined} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : undefined} {...rest} />
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  hint,
  className,
  defaultValue,
  options,
  placeholder,
  required,
  ...rest
}: BaseFieldProps &
  Omit<React.ComponentProps<"select">, "name" | "defaultValue"> & {
    defaultValue?: string | null;
    options: { value: string; label: string }[];
    placeholder?: string;
  }) {
  const id = useId();
  const { state } = useFormCtx();
  const error = state.fieldErrors?.[name];
  const value = useFieldValue(name, defaultValue ?? "");
  return (
    <FieldShell id={id} label={<>{label}{required ? <span className="text-destructive"> *</span> : null}</>} hint={hint} error={error} className={className}>
      <NativeSelect id={id} name={name} defaultValue={value as string} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : undefined} {...rest}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </FieldShell>
  );
}

export function CheckboxField({ name, label, hint, defaultChecked }: { name: string; label: ReactNode; hint?: ReactNode; defaultChecked?: boolean }) {
  const id = useId();
  const { state } = useFormCtx();
  const v = state.values ? state.values[name] === "on" : defaultChecked;
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" name={name} defaultChecked={v} className="mt-0.5 size-4.5 accent-[var(--eucalipto)]" />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="font-normal leading-snug">
          {label}
        </Label>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

export function CheckboxGroupField({
  name,
  legend,
  options,
  defaultValue = [],
  hint,
}: {
  name: string;
  legend: ReactNode;
  options: { value: string; label: string }[];
  defaultValue?: string[];
  hint?: ReactNode;
}) {
  const { state } = useFormCtx();
  const error = state.fieldErrors?.[name];
  const raw = state.values ? state.values[name] : defaultValue;
  const selected = new Set(Array.isArray(raw) ? raw : raw ? [raw] : []);
  const gid = useId();
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${gid}-error` : undefined}>
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const id = `${gid}-${o.value}`;
          return (
            <label key={o.value} htmlFor={id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-secondary">
              <input id={id} type="checkbox" name={name} value={o.value} defaultChecked={selected.has(o.value)} className="size-4 accent-[var(--eucalipto)]" />
              {o.label}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={`${gid}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </fieldset>
  );
}

export function SubmitButton({ children = "Guardar cambios", pendingText = "Guardando…", className, variant }: { children?: ReactNode; pendingText?: string; className?: string; variant?: "default" | "destructive" | "outline" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} className={className} variant={variant}>
      {pending ? pendingText : children}
    </Button>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 border-t pt-5">{children}</div>;
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-primary">
      <CheckCircle2 className="size-4" aria-hidden /> {children}
    </p>
  );
}
