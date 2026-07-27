import { useMemo } from "react";

type PasswordStrengthMeterProps = {
  password: string;
};

const getPasswordStrength = (password: string) => {
  const score = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  if (!password) {
    return { label: "", score: 0, color: "bg-transparent" };
  }

  if (password.length < 8 || score < 3) {
    return { label: "Weak", score: 1, color: "bg-red-500" };
  }

  if (password.length < 12 || score < 4) {
    return { label: "Fair", score: 2, color: "bg-amber-500" };
  }

  return { label: "Strong", score: 3, color: "bg-emerald-500" };
};

export default function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        <span>Password strength</span>
        {strength.label ? <span className="text-foreground">{strength.label}</span> : null}
      </div>
      {/* The bars are decorative; the live region below carries the announcement.
          Deliberately no aria-label here — one containing "Password" would make
          Playwright's getByLabel("Password") match this element as well as the
          password input, breaking the auth E2E specs on strict mode. */}
      <div className="mt-2 flex gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((segment) => {
          const isActive = strength.score > segment;
          return (
            <div
              key={segment}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                isActive ? strength.color : "bg-muted"
              }`}
            />
          );
        })}
      </div>
      <span role="status" className="sr-only">
        {strength.label ? `Password strength: ${strength.label}` : "No password entered"}
      </span>
    </div>
  );
}
