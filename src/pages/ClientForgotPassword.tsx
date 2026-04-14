import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import logo from '@/assets/logo-pcon-grande.png';
import BlueBackground from '@/components/BlueBackground';

const ClientForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error('Por favor, informe seu email');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/cliente/nova-senha`,
      });

      if (error) throw error;

      setSent(true);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar email de recuperação');
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

          {!sent ? (
            <>
              <motion.div
                className="text-center mb-6 sm:mb-8"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}
              >
                <h1 className="text-lg sm:text-xl font-heading font-bold text-foreground mb-1 sm:mb-2">
                  Recuperar Senha
                </h1>
                <p className="text-gray-neutral text-xs sm:text-sm">
                  Informe seu email e enviaremos um link de redefinição
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
                  <Label htmlFor="email" className="text-foreground/80 text-sm font-medium">
                    Email cadastrado
                  </Label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors duration-200" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value.trim())}
                      className="pl-12 h-12 bg-secondary/50 border-border/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all duration-200 rounded-xl"
                      disabled={isLoading}
                      autoComplete="email"
                    />
                  </div>
                </div>

                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} className="pt-1">
                  <Button type="submit" className="w-full h-12 btn-blue text-base" disabled={isLoading}>
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Enviando...
                      </span>
                    ) : (
                      'Enviar link de recuperação'
                    )}
                  </Button>
                </motion.div>
              </motion.form>
            </>
          ) : (
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
              <h2 className="text-lg font-heading font-bold text-foreground">Email enviado!</h2>
              <p className="text-sm text-muted-foreground">
                Verifique sua caixa de entrada em <strong>{email}</strong>.<br />
                Clique no link do email para criar uma nova senha.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Não recebeu? Verifique a pasta de spam ou tente novamente.
              </p>
            </motion.div>
          )}

          {/* Voltar ao login */}
          <motion.div
            className="mt-5 sm:mt-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.4 }}
          >
            <Link
              to="/cliente"
              className="text-sm text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1 font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para o login
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default ClientForgotPassword;
