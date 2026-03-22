import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, CheckCircle, AlertCircle, Send, Phone } from 'lucide-react';
import logo from '@/assets/logo-pcon-grande.png';
import BlueBackground from '@/components/BlueBackground';

const ReferralLanding = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [linkData, setLinkData] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const initPage = async () => {
      if (!slug) {
        setError('Link inválido');
        setLoading(false);
        return;
      }

      try {
        // Fetch settings
        const { data: settingsData, error: settingsError } = await supabase
          .from('referral_settings')
          .select('*')
          .single();

        if (settingsError || !settingsData?.is_active) {
          setError('Sistema de indicação não está ativo no momento');
          setLoading(false);
          return;
        }

        setSettings(settingsData);

        // Fetch link
        const { data: linkDataResult, error: linkError } = await supabase
          .from('referral_links')
          .select('*, clients(name)')
          .eq('slug', slug)
          .single();

        if (linkError || !linkDataResult) {
          setError('Link de indicação não encontrado');
          setLoading(false);
          return;
        }

        if (!linkDataResult.is_active) {
          setError('Este link de indicação está desativado');
          setLoading(false);
          return;
        }

        setLinkData(linkDataResult);

        // Register click
        await registerClick(linkDataResult.id);

        // Store in session for future reference
        sessionStorage.setItem('referral_link_id', linkDataResult.id);
        sessionStorage.setItem('referral_expires', new Date(
          Date.now() + settingsData.validity_days * 24 * 60 * 60 * 1000
        ).toISOString());

      } catch (err) {
        console.error('Error loading referral page:', err);
        setError('Erro ao carregar página');
      } finally {
        setLoading(false);
      }
    };

    initPage();
  }, [slug]);

  const registerClick = async (linkId: string) => {
    try {
      // Create a hash of IP (we'll use a simple hash since we can't access real IP in frontend)
      const ipHash = btoa(navigator.userAgent + new Date().toDateString()).substring(0, 32);

      await supabase.from('referral_clicks').insert({
        referral_link_id: linkId,
        ip_hash: ipHash,
        user_agent: navigator.userAgent,
        referer: document.referrer || null,
      });
    } catch (err) {
      console.error('Error registering click:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Por favor, informe seu nome');
      return;
    }
    
    if (!formData.email.trim() && !formData.phone.trim()) {
      toast.error('Por favor, informe seu email ou telefone');
      return;
    }

    setSubmitting(true);

    try {
      const expiresAt = new Date(
        Date.now() + (settings?.validity_days || 60) * 24 * 60 * 60 * 1000
      ).toISOString();

      const { error } = await supabase.from('referral_leads').insert({
        referral_link_id: linkData.id,
        lead_name: formData.name.trim(),
        lead_email: formData.email.trim() || null,
        lead_phone: formData.phone.trim() || null,
        source: 'form',
        expires_at: expiresAt,
      });

      if (error) throw error;

      setSubmitted(true);
      toast.success('Contato enviado com sucesso!');
    } catch (err) {
      console.error('Error submitting lead:', err);
      toast.error('Erro ao enviar contato. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWhatsApp = async () => {
    // Register as WhatsApp lead
    if (linkData) {
      try {
        const expiresAt = new Date(
          Date.now() + (settings?.validity_days || 60) * 24 * 60 * 60 * 1000
        ).toISOString();

        await supabase.from('referral_leads').insert({
          referral_link_id: linkData.id,
          lead_name: 'Contato WhatsApp',
          source: 'whatsapp',
          expires_at: expiresAt,
        });
      } catch (err) {
        console.error('Error registering WhatsApp lead:', err);
      }
    }

    // Redirect to WhatsApp (update with your number)
    const message = `Olá! Vim através de uma indicação de ${linkData?.clients?.name || 'um cliente'}.`;
    window.open(`https://wa.me/5511978363600?text=${encodeURIComponent(message)}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <BlueBackground />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative z-10 flex flex-col items-center gap-4"
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center relative px-4">
        <BlueBackground />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">{error}</h1>
          <p className="text-muted-foreground mb-4">
            Verifique se o link está correto ou entre em contato conosco.
          </p>
          <Button asChild>
            <a href="https://www.assinaturaspcon.sbs" target="_blank" rel="noopener noreferrer">
              Ir para o site
            </a>
          </Button>
        </motion.div>
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold text-foreground mb-3">Obrigado pelo contato!</h1>
          <p className="text-muted-foreground mb-6">
            Recebemos suas informações e entraremos em contato em breve. 
            Você veio através da indicação de <strong>{linkData?.clients?.name}</strong>.
          </p>
          <Button variant="outline" asChild>
            <a href="https://www.assinaturaspcon.sbs" target="_blank" rel="noopener noreferrer">
              Conhecer mais sobre nós
            </a>
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <BlueBackground />
      
      {/* Header */}
      <motion.header 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-20 glass-card border-b border-border/20"
      >
        <div className="container mx-auto px-4 py-4 flex items-center justify-center">
          <img src={logo} alt="Logo" className="h-12 sm:h-14 w-auto" />
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="relative z-10 container mx-auto px-4 py-10 sm:py-16 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl sm:text-3xl font-heading font-bold text-foreground mb-3">
            Bem-vindo!
          </h1>
          <p className="text-muted-foreground">
            Você foi indicado por <strong className="text-foreground">{linkData?.clients?.name}</strong>. 
            Entre em contato conosco e descubra como podemos ajudar você!
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg font-heading">Entre em Contato</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    placeholder="Seu nome completo"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Enviar Contato
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full bg-success/10 border-success/30 text-success hover:bg-success/20"
                onClick={handleWhatsApp}
              >
                <Phone className="w-4 h-4 mr-2" />
                Falar pelo WhatsApp
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
};

export default ReferralLanding;
