import { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, CheckCircle, Send, User, UserPlus } from 'lucide-react';
import logo from '@/assets/logo-pcon-grande.png';
import BlueBackground from '@/components/BlueBackground';

const ReferralForm = () => {
  const [formData, setFormData] = useState({
    referrerName: '',
    referrerPhone: '',
    referrerEmail: '',
    referrerDocument: '',
    referredName: '',
    referredPhone: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const formatDocument = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    if (digits.length <= 11) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.referrerName.trim() || !formData.referrerPhone.trim()) {
      toast.error('Preencha o nome e telefone do indicador');
      return;
    }
    if (!formData.referredName.trim() || !formData.referredPhone.trim()) {
      toast.error('Preencha o nome e telefone do indicado');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('referral_submissions' as any).insert({
        referrer_name: formData.referrerName.trim(),
        referrer_phone: formData.referrerPhone.trim(),
        referrer_email: formData.referrerEmail.trim() || null,
        referrer_document: formData.referrerDocument.trim() || null,
        referred_name: formData.referredName.trim(),
        referred_phone: formData.referredPhone.trim(),
      });

      if (error) throw error;

      // Send confirmation email if email was provided
      if (formData.referrerEmail.trim()) {
        try {
          await supabase.functions.invoke('referral-confirmation-email', {
            body: {
              referrerName: formData.referrerName.trim(),
              referrerEmail: formData.referrerEmail.trim(),
              referredName: formData.referredName.trim(),
            },
          });
        } catch (emailErr) {
          console.error('Email sending failed (non-blocking):', emailErr);
        }
      }

      setSubmitted(true);
      toast.success('Indicação enviada com sucesso!');
    } catch (err) {
      console.error('Error submitting referral:', err);
      toast.error('Erro ao enviar indicação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center relative px-4">
        <BlueBackground />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 text-center max-w-md"
        >
          <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-3">Indicação enviada!</h1>
          <p className="text-muted-foreground mb-6">
            Obrigado pela sua indicação! Nossa equipe irá entrar em contato com o indicado em breve.
          </p>
          <Button onClick={() => { setSubmitted(false); setFormData({ referrerName: '', referrerPhone: '', referrerEmail: '', referrerDocument: '', referredName: '', referredPhone: '' }); }}>
            Fazer outra indicação
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <BlueBackground />

      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-20 glass-card border-b border-border/20"
      >
        <div className="container mx-auto px-4 py-4 flex items-center justify-center">
          <img src={logo} alt="P-CON" className="h-12 sm:h-14 w-auto" />
        </div>
      </motion.header>

      <main className="relative z-10 container mx-auto px-4 py-10 sm:py-16 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl sm:text-3xl font-heading font-bold text-foreground mb-3">
            Indicar alguém
          </h1>
          <p className="text-muted-foreground">
            Preencha os dados abaixo para registrar sua indicação. Nossa equipe entrará em contato!
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Indicador */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Seus Dados (Indicador)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="referrerName">Nome completo *</Label>
                  <Input
                    id="referrerName"
                    placeholder="Seu nome completo"
                    value={formData.referrerName}
                    onChange={(e) => setFormData({ ...formData, referrerName: e.target.value })}
                    maxLength={100}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="referrerPhone">Telefone/WhatsApp *</Label>
                  <Input
                    id="referrerPhone"
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={formData.referrerPhone}
                    onChange={(e) => setFormData({ ...formData, referrerPhone: formatPhone(e.target.value) })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="referrerEmail">Email</Label>
                  <Input
                    id="referrerEmail"
                    type="email"
                    placeholder="seu@email.com"
                    value={formData.referrerEmail}
                    onChange={(e) => setFormData({ ...formData, referrerEmail: e.target.value })}
                    maxLength={255}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="referrerDocument">CPF/CNPJ</Label>
                  <Input
                    id="referrerDocument"
                    placeholder="000.000.000-00"
                    value={formData.referrerDocument}
                    onChange={(e) => setFormData({ ...formData, referrerDocument: formatDocument(e.target.value) })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Indicado */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-success" />
                  Dados do Indicado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="referredName">Nome completo *</Label>
                  <Input
                    id="referredName"
                    placeholder="Nome do indicado"
                    value={formData.referredName}
                    onChange={(e) => setFormData({ ...formData, referredName: e.target.value })}
                    maxLength={100}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="referredPhone">Telefone/WhatsApp *</Label>
                  <Input
                    id="referredPhone"
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={formData.referredPhone}
                    onChange={(e) => setFormData({ ...formData, referredPhone: formatPhone(e.target.value) })}
                    required
                  />
                </div>
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Enviar Indicação
            </Button>
          </form>
        </motion.div>
      </main>
    </div>
  );
};

export default ReferralForm;
