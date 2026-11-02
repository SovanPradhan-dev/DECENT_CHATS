import { forwardRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Waves, ArrowRight, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { api } from '../../services/api';
import { useAppStore } from '../../stores/appStore';

const loginSchema = z.object({ identity: z.string().min(1, 'Enter your email or username.'), password: z.string().min(1, 'Enter your password.'), remember: z.boolean().optional() });
const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Use at least 2 characters.').max(80),
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,24}$/, 'Use 3–24 letters, numbers, or underscores.'),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(10, 'Use at least 10 characters.').max(128),
  confirmPassword: z.string(),
  acceptedTerms: z.boolean().refine(value => value, 'Please accept the terms to continue.')
}).refine(data => data.password === data.confirmPassword, { message: 'Passwords do not match.', path: ['confirmPassword'] });

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const setUser = useAppStore(state => state.setUser);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { register, handleSubmit, watch, formState: { errors } } = useForm({ resolver: zodResolver(isRegister ? registerSchema : loginSchema), defaultValues: { acceptedTerms: false, remember: true } });
  const password = watch('password') || '';
  const strength = password.length === 0 ? 0 : Math.min(4, Number(password.length >= 10) + Number(/[A-Z]/.test(password) && /[a-z]/.test(password)) + Number(/\d/.test(password)) + Number(/[^a-zA-Z0-9]/.test(password)));
  const submit = async (values) => {
    setBusy(true);
    try {
      const { confirmPassword, acceptedTerms, ...body } = values;
      const { user } = await api(isRegister ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(isRegister ? { ...body, acceptedTerms } : body) });
      setUser(user);
      queryClient.setQueryData(['me'], { user });
      toast.success(isRegister ? 'Your ChatWave space is ready.' : `Welcome back, ${user.fullName.split(' ')[0]}.`);
      navigate('/', { replace: true });
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  };
  return (
    <main className="auth-page">
      <div className="auth-decoration decor-one" /><div className="auth-decoration decor-two" />
      <section className="auth-brand">
        <div className="brand-lockup"><div className="brand-mark"><Waves size={22} /></div><span>ChatWave</span></div>
        <div className="brand-story">
          <div className="eyebrow"><span className="status-dot" /> YOUR PEOPLE, IN SYNC</div>
          <h1>Conversations<br />that <span>move with you.</span></h1>
          <p>A calmer space for the conversations that matter. Close, connected, and always in motion.</p>
        </div>
        <div className="auth-footnote"><ShieldCheck size={16} /> Private by design. Your conversations stay yours.</div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-brand brand-lockup"><div className="brand-mark"><Waves size={20} /></div><span>ChatWave</span></div>
          <div className="auth-heading"><span className="eyebrow">{isRegister ? 'A BETTER WAY TO STAY CLOSE' : 'YOUR SPACE IS WAITING'}</span><h2>{isRegister ? 'Create your account' : 'Welcome back'}</h2><p>{isRegister ? 'Start conversations that feel a little more human.' : 'Pick up right where your conversations left off.'}</p></div>
          <form onSubmit={handleSubmit(submit)} className="auth-form">
            {isRegister && <Field label="Full name" placeholder="Alex Morgan" autoComplete="name" error={errors.fullName?.message} {...register('fullName')} />}
            {isRegister && <Field label="Username" placeholder="alexmorgan" autoComplete="username" error={errors.username?.message} {...register('username')} />}
            <Field label={isRegister ? 'Email address' : 'Email or username'} placeholder={isRegister ? 'you@example.com' : 'Enter your email or username'} autoComplete={isRegister ? 'email' : 'username'} error={errors[isRegister ? 'email' : 'identity']?.message} {...register(isRegister ? 'email' : 'identity')} />
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-wrap"><input id="password" type={visible ? 'text' : 'password'} placeholder={isRegister ? 'At least 10 characters' : 'Enter your password'} autoComplete={isRegister ? 'new-password' : 'current-password'} {...register('password')} /><button className="icon-button password-toggle" type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
              {errors.password && <span className="field-error">{errors.password.message}</span>}
            </div>
            {isRegister && <><div className="strength" aria-label={`Password strength ${strength} of 4`}><div className="strength-bars">{[1, 2, 3, 4].map(level => <span key={level} className={strength >= level ? `active strength-${strength}` : ''} />)}</div><span>{password ? ['Too short', 'Getting there', 'Good', 'Strong', 'Excellent'][strength] : 'Password strength'}</span></div><Field label="Confirm password" placeholder="Enter your password again" type="password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} /><label className="checkbox-line"><input type="checkbox" {...register('acceptedTerms')} /><span>I agree to the <a href="#terms" onClick={e => { e.preventDefault(); toast.info('Use ChatWave respectfully. Do not share unlawful or harmful content.'); }}>terms of service</a></span></label>{errors.acceptedTerms && <span className="field-error">{errors.acceptedTerms.message}</span>}</>}
            {!isRegister && <div className="form-meta"><label className="checkbox-line"><input type="checkbox" {...register('remember')} /><span>Remember me</span></label><button type="button" className="text-link" onClick={() => toast.info('Password recovery is not configured. Contact your ChatWave administrator to reset your account securely.')}>Forgot password?</button></div>}
            <button type="submit" className="primary-button auth-submit" disabled={busy}>{busy ? <span className="spinner" /> : <>{isRegister ? 'Create account' : 'Sign in'} <ArrowRight size={17} /></>}</button>
          </form>
          <div className="auth-switch">{isRegister ? 'Already part of the conversation?' : 'New to ChatWave?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></div>
        </div>
        <div className="auth-legal">© 2026 ChatWave <span>·</span> Thoughtfully connected.</div>
      </section>
    </main>
  );
}

const Field = forwardRef(function Field({ label, error, id, type = 'text', ...props }, ref) {
  const inputId = id || props.name;
  return <div className="field"><label htmlFor={inputId}>{label}</label><input ref={ref} id={inputId} type={type} className={error ? 'input-error' : ''} {...props} />{error && <span className="field-error">{error}</span>}</div>;
});
