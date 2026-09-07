import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input } from '@/components/ui';
import { signIn, signInWithGoogle } from '@/services';
import { loginSchema, type LoginInput } from '@/utils/validation';
import { toMessage } from '@/utils/errors';

export function LoginPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values);
      navigate('/', { replace: true });
    } catch (error) {
      setFormError(toMessage(error));
    }
  });

  const onGoogleClick = async () => {
    setFormError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      navigate('/', { replace: true });
    } catch (error) {
      setFormError(toMessage(error));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Pick up where your orders left off.</p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@yourshop.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        {formError && (
          <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            {formError}
          </p>
        )}

        <Button type="submit" fullWidth loading={isSubmitting}>
          Sign in
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium uppercase text-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button
        type="button"
        variant="secondary"
        fullWidth
        loading={googleLoading}
        onClick={onGoogleClick}
      >
        Continue with Google
      </Button>

      <p className="mt-6 text-sm text-muted">
        New here?{' '}
        <Link to="/signup" className="font-semibold text-brand">
          Create a business account
        </Link>
      </p>
    </div>
  );
}
