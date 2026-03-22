import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Users,
  Search,
  Phone,
  Mail,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  ExternalLink,
  Copy,
  User,
  UserPlus,
} from 'lucide-react';
import WhatsAppIcon from '@/components/WhatsAppIcon';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ReferralSubmission {
  id: string;
  referrer_name: string;
  referrer_phone: string;
  referrer_email: string | null;
  referrer_document: string | null;
  referred_name: string;
  referred_phone: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

const formatDate = (date: string) => {
  return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
};

const Referrals = () => {
  const [submissions, setSubmissions] = useState<ReferralSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSubmission, setSelectedSubmission] = useState<ReferralSubmission | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const FORM_URL = 'https://www.assinaturaspcon.sbs/indicar';

  const fetchSubmissions = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('referral_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching submissions:', error);
      return;
    }
    setSubmissions(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any)
      .from('referral_submissions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar status');
      return;
    }
    toast.success('Status atualizado!');
    fetchSubmissions();
    if (selectedSubmission?.id === id) {
      setSelectedSubmission({ ...selectedSubmission, status });
    }
  };

  const saveAdminNotes = async () => {
    if (!selectedSubmission) return;
    setSavingNotes(true);
    const { error } = await (supabase as any)
      .from('referral_submissions')
      .update({ admin_notes: adminNotes, updated_at: new Date().toISOString() })
      .eq('id', selectedSubmission.id);

    if (error) {
      toast.error('Erro ao salvar anotações');
    } else {
      toast.success('Anotações salvas!');
      fetchSubmissions();
      setSelectedSubmission({ ...selectedSubmission, admin_notes: adminNotes });
    }
    setSavingNotes(false);
  };

  const deleteSubmission = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta indicação?')) return;
    const { error } = await (supabase as any)
      .from('referral_submissions')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir');
      return;
    }
    toast.success('Indicação excluída!');
    fetchSubmissions();
    if (selectedSubmission?.id === id) {
      setIsDetailOpen(false);
      setSelectedSubmission(null);
    }
  };

  const openWhatsApp = (phone: string, name: string) => {
    let formatted = phone.replace(/\D/g, '');
    if (!formatted.startsWith('55')) formatted = '55' + formatted;
    const message = `Olá ${name}! Tudo bem?`;
    window.open(`https://wa.me/${formatted}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const openDetail = (sub: ReferralSubmission) => {
    setSelectedSubmission(sub);
    setAdminNotes(sub.admin_notes || '');
    setIsDetailOpen(true);
  };

  const copyFormLink = () => {
    navigator.clipboard.writeText(FORM_URL);
    toast.success('Link do formulário copiado!');
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
      pending: { label: 'Pendente', className: 'bg-warning/20 text-warning border-warning/30', icon: <Clock className="h-3 w-3" /> },
      contacted: { label: 'Contatado', className: 'bg-primary/20 text-primary border-primary/30', icon: <Phone className="h-3 w-3" /> },
      converted: { label: 'Convertido', className: 'bg-success/20 text-success border-success/30', icon: <CheckCircle className="h-3 w-3" /> },
      rejected: { label: 'Rejeitado', className: 'bg-destructive/20 text-destructive border-destructive/30', icon: <XCircle className="h-3 w-3" /> },
    };
    const config = configs[status] || { label: status, className: 'bg-muted', icon: null };
    return (
      <Badge className={`${config.className} border flex items-center gap-1`}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  const filtered = submissions.filter((sub) => {
    const matchesSearch =
      sub.referrer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.referred_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.referrer_phone.includes(searchTerm) ||
      sub.referred_phone.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: submissions.length,
    pending: submissions.filter((s) => s.status === 'pending').length,
    contacted: submissions.filter((s) => s.status === 'contacted').length,
    converted: submissions.filter((s) => s.status === 'converted').length,
  };

  if (loading) {
    return (
      <DashboardLayout title="Indicações" subtitle="Carregando...">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Indicações" subtitle="Formulários de indicação recebidos">
      <div className="space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Indicações</h1>
            <p className="text-muted-foreground text-sm">Gerencie os formulários de indicação recebidos</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={copyFormLink}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar link do formulário
            </Button>
            <Button size="sm" asChild>
              <a href={FORM_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir formulário
              </a>
            </Button>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-warning/20 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                  <p className="text-xl font-bold">{stats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Phone className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Contatados</p>
                  <p className="text-xl font-bold">{stats.contacted}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-success/20 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Convertidos</p>
                  <p className="text-xl font-bold">{stats.converted}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="contacted">Contatados</SelectItem>
              <SelectItem value="converted">Convertidos</SelectItem>
              <SelectItem value="rejected">Rejeitados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card className="glass-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Indicador</TableHead>
                  <TableHead>Indicado</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {searchTerm || statusFilter !== 'all' ? 'Nenhuma indicação encontrada com esses filtros' : 'Nenhuma indicação recebida ainda'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((sub) => (
                    <TableRow key={sub.id} className="cursor-pointer hover:bg-secondary/30" onClick={() => openDetail(sub)}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground flex items-center gap-1">
                            <User className="h-3 w-3 text-primary" />
                            {sub.referrer_name}
                          </p>
                          <p className="text-xs text-muted-foreground">{sub.referrer_phone}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground flex items-center gap-1">
                            <UserPlus className="h-3 w-3 text-success" />
                            {sub.referred_name}
                          </p>
                          <p className="text-xs text-muted-foreground">{sub.referred_phone}</p>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(sub.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(sub.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="WhatsApp do indicado"
                            onClick={() => openWhatsApp(sub.referred_phone, sub.referred_name)}
                          >
                            <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Excluir"
                            onClick={() => deleteSubmission(sub.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da Indicação</DialogTitle>
          </DialogHeader>
          {selectedSubmission && (
            <div className="space-y-6">
              {/* Indicador */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Indicador
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Nome</p>
                    <p className="font-medium">{selectedSubmission.referrer_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Telefone</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{selectedSubmission.referrer_phone}</p>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openWhatsApp(selectedSubmission.referrer_phone, selectedSubmission.referrer_name)}>
                        <WhatsAppIcon className="h-3 w-3 text-[#25D366]" />
                      </Button>
                    </div>
                  </div>
                  {selectedSubmission.referrer_email && (
                    <div>
                      <p className="text-muted-foreground">Email</p>
                      <p className="font-medium">{selectedSubmission.referrer_email}</p>
                    </div>
                  )}
                  {selectedSubmission.referrer_document && (
                    <div>
                      <p className="text-muted-foreground">CPF/CNPJ</p>
                      <p className="font-medium">{selectedSubmission.referrer_document}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Indicado */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-success" />
                  Indicado
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Nome</p>
                    <p className="font-medium">{selectedSubmission.referred_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Telefone</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{selectedSubmission.referred_phone}</p>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openWhatsApp(selectedSubmission.referred_phone, selectedSubmission.referred_name)}>
                        <WhatsAppIcon className="h-3 w-3 text-[#25D366]" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Status</p>
                <Select value={selectedSubmission.status} onValueChange={(val) => updateStatus(selectedSubmission.id, val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="contacted">Contatado</SelectItem>
                    <SelectItem value="converted">Convertido</SelectItem>
                    <SelectItem value="rejected">Rejeitado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Admin Notes */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Anotações do admin</p>
                <Textarea
                  placeholder="Adicione observações sobre esta indicação..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                />
                <Button size="sm" onClick={saveAdminNotes} disabled={savingNotes}>
                  Salvar anotações
                </Button>
              </div>

              <div className="text-xs text-muted-foreground">
                Recebido em {formatDate(selectedSubmission.created_at)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Referrals;
