import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileSignature, Download, Loader2, XCircle, ShieldCheck, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BlueBackground from '@/components/BlueBackground';

interface Contract {
  id: string;
  title: string;
  content: string | null;
  file_path: string | null;
  status: string;
  created_at: string;
  client?: {
    name: string;
    email: string;
  };
}

const ContractPublic = () => {
  const { id } = useParams<{ id: string }>();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const loadContract = async () => {
      if (!id) { setNotFound(true); setLoading(false); return; }
      try {
        const { data, error } = await supabase
          .from('contracts')
          .select('*, client:clients(name, email)')
          .eq('id', id)
          .single();

        if (error || !data) {
          setNotFound(true);
        } else {
          setContract(data as Contract);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    loadContract();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <BlueBackground />
        <div className="relative z-10 flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-sm">Carregando contrato...</p>
        </div>
      </div>
    );
  }

  if (notFound || !contract) {
    return (
      <div className="min-h-screen flex items-center justify-center relative px-4">
        <BlueBackground />
        <Card className="glass-card relative z-10 max-w-lg w-full">
          <CardContent className="p-8 text-center space-y-4">
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <h1 className="text-2xl font-heading font-bold">Contrato não encontrado</h1>
              <p className="text-muted-foreground mt-2">
                O link pode estar incorreto ou o contrato não está mais disponível.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">P-CON CONSTRUNET</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPDF = contract.file_path && (
    contract.file_path.toLowerCase().includes('.pdf') ||
    contract.file_path.toLowerCase().includes('pdf')
  );

  return (
    <div className="min-h-screen relative overflow-hidden">
      <BlueBackground />
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* Header */}
        <header className="border-b border-border/30 bg-background/50 backdrop-blur-xl sticky top-0 z-20">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/images/logo-pcon-white.png"
                alt="P-CON CONSTRUNET"
                className="h-12 sm:h-14 w-auto object-contain"
              />
            </div>
            <Badge className="border border-success/30 bg-success/20 text-success text-xs">
              <ShieldCheck className="h-3 w-3 mr-1" />
              Contrato Oficial
            </Badge>
          </div>
        </header>

        {/* Main */}
        <main className="container mx-auto px-4 py-8 sm:py-12 max-w-4xl flex-1">

          {/* Contract header card */}
          <div className="mb-6 sm:mb-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/50 bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-[var(--shadow-glow)] backdrop-blur-md mb-4">
              <FileSignature className="h-3.5 w-3.5" />
              Documento Contratual
            </span>
            <h1 className="text-2xl sm:text-4xl font-heading font-bold leading-tight mb-4">
              {contract.title}
            </h1>

            <Card className="glass-card">
              <CardContent className="p-4 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Contratante</p>
                      <p className="text-sm font-semibold text-foreground">
                        {contract.client?.name || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Data do Contrato</p>
                      <p className="text-sm font-semibold text-foreground">
                        {format(new Date(contract.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-success/20 flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="h-4 w-4 text-success" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="text-sm font-semibold text-success capitalize">
                        {contract.status === 'active' ? 'Ativo' : contract.status}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* PDF viewer */}
          {contract.file_path && (
            <Card className="glass-card mb-6">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base sm:text-lg font-heading font-semibold flex items-center gap-2">
                    <FileSignature className="h-4 w-4 text-primary" />
                    Documento Assinado
                  </h2>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 text-xs"
                    onClick={() => window.open(contract.file_path!, '_blank')}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Baixar PDF
                  </Button>
                </div>

                {isPDF ? (
                  <div className="rounded-xl overflow-hidden border border-border/40 bg-black/20" style={{ height: '70vh', minHeight: '500px' }}>
                    <iframe
                      src={`${contract.file_path}#toolbar=1&navpanes=0&scrollbar=1`}
                      className="w-full h-full"
                      title={contract.title}
                    />
                  </div>
                ) : (
                  /* For images or non-PDF files */
                  <div className="flex flex-col items-center gap-4 py-8">
                    <FileSignature className="h-16 w-16 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground text-center">
                      Documento disponível para download
                    </p>
                    <Button
                      className="gap-2"
                      onClick={() => window.open(contract.file_path!, '_blank')}
                    >
                      <Download className="h-4 w-4" />
                      Abrir Documento
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Text content */}
          {contract.content && (
            <Card className="glass-card mb-6">
              <CardContent className="p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-heading font-semibold mb-4 flex items-center gap-2">
                  <FileSignature className="h-4 w-4 text-primary" />
                  Conteúdo do Contrato
                </h2>
                <div className="bg-secondary/20 rounded-xl border border-border/40 p-4 sm:p-6">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-foreground leading-relaxed">
                    {contract.content}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Footer */}
          <div className="text-center py-6 border-t border-border/30 mt-4">
            <p className="text-xs text-muted-foreground mb-1">
              Documento emitido por
            </p>
            <img
              src="/images/logo-pcon-white.png"
              alt="P-CON CONSTRUNET"
              className="h-8 w-auto object-contain mx-auto opacity-60"
            />
            <p className="text-xs text-muted-foreground mt-2">
              © P-CON CONSTRUNET · www.pconassinantes.site
            </p>
          </div>

        </main>
      </div>
    </div>
  );
};

export default ContractPublic;
