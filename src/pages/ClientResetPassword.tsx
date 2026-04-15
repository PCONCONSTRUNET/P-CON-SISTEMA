import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import logo from '@/assets/logo-pcon-grande.png';
import BlueBackground from '@/components/BlueBackground';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const ClientResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [tokenEmail, setTokenEmail] = useState('');
  const [done, setDone] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setIsVerifying(false);
        return;
      }

      try {
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/client-auth-new?action=verify-reset-token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          }
        );

        const data = await response.json();
        if (data.valid) {
          setIsValidToken(true);
          setTokenEmail(data.email || '');
        }
      } catch (error) {
        console.error('Error verifying token:', error);
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      toast.error('Preencha todos os campos');
      return;
    }

    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/client-auth-new?action=reset-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao redefinir senha');
      }

      setDone(true);
      toast.success('Senha redefinida com sucesso!');

      setTimeout(() => navigate('/cliente'), 3000);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao redefinir senha');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] overflow-hidden flex items-center justify-center p-4 relative">
      <BlueBackground />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-lg relative z-10"
      >
        <div className="glass-card p-4 sm:p-10">
          {/* Logo */}
          <motion.div
            className="flex justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <img
              src={logo}
              alt="P-CON Logo"
              className="w-full max-w-[12rem] sm:max-w-[16rem] h-auto drop-shadow-[0_12px_36px_hsl(var(--primary)/0.35)] brightness-0 invert opacity-90 -mt-10 sm:-mt-12 -mb-20 sm:-mb-24"
              style={{ clipPath: 'inset(25% 0 38% 0)' }}
            />
          </motion.div>

          {isVerifying ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8"
            >
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Verificando link...</p>
            </motion.div>
          ) : done ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4 space-y-4"
            >
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-success" />
                </div>
              </div>
              <h2 className="text-lg font-heading font-bold text-foreground">Senha redefinida!</h2>
              <p className="text-sm text-muted-foreground">
                Sua senha foi atualizada com sucesso.<br />
                Redirecionando para o login...
              </p>
            </motion.div>
          ) : !token || !isValidToken ? (
            <>
              <motion.div
                className="text-center mb-6 sm:mb-8"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}
              >
                <h1 className="text-lg sm:text-xl font-heading font-bold text-foreground mb-1 sm:mb-2">
                  Nova Senha
                </h1>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-6 space-y-4"
              >
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-full bg-destructive/15 flex items-center justify-center">
                    <AlertCircle className="h-7 w-7 text-destructive" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Link de recuperação inválido ou expirado.
                </p>
                <Link
                  to="/cliente/recuperar-senha"
                  className="inline-block text-sm text-primary hover:text-primary/80 transition-colors font-medium"
                >
                  Solicitar novo link →
                </Link>
              </motion.div>
            </>
          ) : (
            <>
              <motion.div
                className="text-center mb-6 sm:mb-8"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}
              >
                <h1 className="text-lg sm:text-xl font-heading font-bold text-foreground mb-1 sm:mb-2">
                  Nova Senha
                </h1>
                <p className="text-gray-neutral text-xs sm:text-sm">
                  {tokenEmail ? (
                    <>Defina a nova senha para <strong>{tokenEmail}</strong></>
                  ) : (
                    'Defina sua nova senha de acesso'
                  )}
                </p>
              </motion.div>

              <motion.form
                onSubmit={handleSubmit}
                className="space-y-4 sm:space-y-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.4 }}
              >
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground/80 text-sm font-medium">
                    Nova senha
                  </Label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-200" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-12 pr-12 h-12 bg-secondary/50 border-border/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all duration-200 rounded-xl"
                      disabled={isLoading}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-foreground/80 text-sm font-medium">
                    Confirmar senha
                  </Label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-200" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Repita a nova senha"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-12 h-12 bg-secondary/50 border-border/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all duration-200 rounded-xl"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Strength indicator */}
                {password && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            password.length >= i * 2
                              ? password.length >= 8
                                ? 'bg-success'
                                : password.length >= 6
                                ? 'bg-warning'
                                : 'bg-destructive'
                              : 'bg-muted'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {password.length < 6 ? 'Senha muito curta' : password.length < 8 ? 'Senha razoável' : 'Senha forte'}
                    </p>
                  </div>
                )}

                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} className="pt-1">
                  <Button type="submit" className="w-full h-12 btn-blue text-base" disabled={isLoading}>
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Salvando...
                      </span>
                    ) : (
                      'Salvar nova senha'
                    )}
                  </Button>
                </motion.div>
              </motion.form>
            </>
          )}

          <motion.div
            className="mt-5 sm:mt-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.4 }}
          >
            <Link
              to="/cliente"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Voltar para o login
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default ClientResetPassword;
