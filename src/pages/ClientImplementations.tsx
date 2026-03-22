import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { 
  Package, 
  Sparkles, 
  TrendingUp, 
  Timer, 
  Clock, 
  CheckCircle2,
  Search,
  ArrowLeft,
  History,
  Rocket,
  Zap,
  Star,
  Shield,
  ArrowRight,
  Trash2,
  CreditCard,
  Banknote
} from 'lucide-react';
import { useImplementations, Implementation } from '@/hooks/useImplementations';
import { useClientAuth } from '@/contexts/ClientAuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import BlueBackground from '@/components/BlueBackground';
import logo from '@/assets/logo-pcon-grande.png';

const ClientImplementations = () => {
  const navigate = useNavigate();
  const { client, isAuthenticated, logout } = useClientAuth();
  const {
    implementations,
    requests,
    loading,
    fetchImplementations,
    fetchRequests,
    createRequest,
    deleteRequest,
    getCategories
  } = useImplementations();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImpl, setSelectedImpl] = useState<Implementation | null>(null);
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [requestNotes, setRequestNotes] = useState('');
  const [paymentType, setPaymentType] = useState<'avista' | 'parcelado'>('avista');
  const [installments, setInstallments] = useState<number>(2);
  const [submitting, setSubmitting] = useState(false);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/cliente');
      return;
    }
    fetchImplementations(true);
    if (client?.id) {
      fetchRequests(client.id);
    }
  }, [isAuthenticated, client?.id, fetchImplementations, fetchRequests, navigate]);

  const categories = getCategories();

  const filteredImplementations = implementations.filter(impl => {
    const matchesCategory = selectedCategory === 'all' || impl.category === selectedCategory;
    const matchesSearch = impl.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      impl.short_description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      impl.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleDetailClick = (impl: Implementation) => {
    setSelectedImpl(impl);
    setIsDetailDialogOpen(true);
  };

  const handleRequestClick = (impl: Implementation) => {
    setSelectedImpl(impl);
    setIsDetailDialogOpen(false);
    setIsRequestDialogOpen(true);
  };

  const handleSubmitRequest = async () => {
    if (!selectedImpl || !client?.id) return;
    
    setSubmitting(true);
    const paymentInfo = paymentType === 'avista' 
      ? 'À Vista' 
      : `Parcelado em ${installments}x`;
    const notesWithPayment = `[Pagamento: ${paymentInfo}]${requestNotes ? ` - ${requestNotes}` : ''}`;
    const success = await createRequest(selectedImpl.id, client.id, notesWithPayment);
    
    if (success) {
      setIsRequestDialogOpen(false);
      setRequestNotes('');
      setPaymentType('avista');
      setInstallments(2);
      setSelectedImpl(null);
      fetchRequests(client.id);
    }
    setSubmitting(false);
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!client?.id) return;
    setDeletingRequestId(requestId);
    await deleteRequest(requestId, client.id);
    setDeletingRequestId(null);
  };

  const getTagIcon = (tag: string) => {
    if (tag.toLowerCase() === 'novo') return <Sparkles className="w-3 h-3" />;
    if (tag.toLowerCase() === 'popular') return <TrendingUp className="w-3 h-3" />;
    if (tag.toLowerCase() === 'em breve') return <Timer className="w-3 h-3" />;
    return null;
  };

  const getTagStyles = (tag: string) => {
    if (tag.toLowerCase() === 'novo') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (tag.toLowerCase() === 'popular') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    if (tag.toLowerCase() === 'em breve') return 'bg-sky-500/20 text-sky-400 border-sky-500/30';
    return 'bg-white/10 text-white/70 border-white/20';
  };

  const getStatusInfo = (status: string) => {
    const info: Record<string, { color: string; bgColor: string; label: string; icon: React.ReactNode }> = {
      pending: { 
        color: 'text-amber-400', 
        bgColor: 'bg-amber-500/20 border-amber-500/30',
        label: 'Aguardando', 
        icon: <Clock className="w-4 h-4" /> 
      },
      approved: { 
        color: 'text-emerald-400', 
        bgColor: 'bg-emerald-500/20 border-emerald-500/30',
        label: 'Aprovado', 
        icon: <CheckCircle2 className="w-4 h-4" /> 
      },
      rejected: { 
        color: 'text-red-400', 
        bgColor: 'bg-red-500/20 border-red-500/30',
        label: 'Rejeitado', 
        icon: null 
      },
      completed: { 
        color: 'text-sky-400', 
        bgColor: 'bg-sky-500/20 border-sky-500/30',
        label: 'Concluído', 
        icon: <CheckCircle2 className="w-4 h-4" /> 
      }
    };
    return info[status] || info.pending;
  };

  const isAlreadyRequested = (implId: string) => {
    return requests.some(r => 
      r.implementation_id === implId && 
      (r.status === 'pending' || r.status === 'approved')
    );
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="relative min-h-screen">
      <BlueBackground />
      <div className="relative z-10 min-h-screen p-4 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-8"
          >
            <div className="flex items-center gap-4">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate('/checkout')}
                  className="text-white hover:bg-white/10 backdrop-blur-sm border border-white/10"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </motion.div>
              <img src={logo} alt="P-CON" className="h-10 lg:h-12" />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-white/80 text-sm hidden sm:block">
                Olá, <span className="font-semibold text-white">{client?.name?.split(' ')[0]}</span>
              </span>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={logout}
                  className="border-white/20 bg-white/5 text-white hover:bg-white/10 backdrop-blur-sm"
                >
                  Sair
                </Button>
              </motion.div>
            </div>
          </motion.div>

          {/* Title */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-center mb-10"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-4">
              <Rocket className="w-4 h-4 text-primary-foreground" />
              <span className="text-sm text-white/90">Expanda seu Sistema</span>
            </div>
            <h1 className="text-3xl lg:text-5xl font-bold text-white mb-3 tracking-tight">
              Implantações Futuras
            </h1>
            <p className="text-white/70 text-lg max-w-2xl mx-auto">
              Descubra módulos e sistemas para potencializar o seu negócio
            </p>
          </motion.div>

          <Tabs defaultValue="available" className="w-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <TabsList className="bg-white/10 backdrop-blur-sm border border-white/20 mb-6 p-1">
                <TabsTrigger 
                  value="available" 
                  className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-lg gap-2 transition-all"
                >
                  <Package className="w-4 h-4" />
                  Disponíveis
                </TabsTrigger>
                <TabsTrigger 
                  value="history" 
                  className="data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-lg gap-2 transition-all"
                >
                  <History className="w-4 h-4" />
                  Minhas Solicitações
                  {requests.length > 0 && (
                    <Badge className="ml-1 bg-white/20 text-white border-0 text-xs">
                      {requests.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </motion.div>

            <TabsContent value="available" className="relative z-10">
              {/* Filters */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="mb-8 bg-white/10 backdrop-blur-xl border-white/20 shadow-2xl">
                  <CardContent className="p-4 lg:p-6">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                        <Input
                          placeholder="Buscar implantações..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-12 bg-white/10 border-white/20 text-white placeholder:text-white/50 h-12 text-base focus:bg-white/20 transition-colors"
                        />
                      </div>
                      {categories.length > 0 && (
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                          <SelectTrigger className="w-full sm:w-[220px] bg-white/10 border-white/20 text-white h-12">
                            <SelectValue placeholder="Todas as categorias" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas as categorias</SelectItem>
                            {categories.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Implementations Grid */}
              {loading ? (
                <div className="text-center py-16">
                  <div className="inline-flex items-center gap-3 text-white/70">
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Carregando módulos...</span>
                  </div>
                </div>
              ) : filteredImplementations.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <Card className="bg-white/10 backdrop-blur-xl border-white/20">
                    <CardContent className="text-center py-16">
                      <Package className="w-16 h-16 text-white/30 mx-auto mb-4" />
                      <p className="text-white/70 text-lg">Nenhuma implantação encontrada</p>
                      <p className="text-white/50 text-sm mt-2">Tente ajustar os filtros de busca</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                <motion.div 
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10 pb-8"
                >
                  {filteredImplementations.map((impl, index) => (
                    <motion.div
                      key={impl.id}
                      variants={itemVariants}
                      whileHover={{ y: -5, transition: { duration: 0.2 } }}
                    >
                      <Card 
                        className="h-full bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-xl border-white/20 shadow-2xl overflow-hidden group hover:border-white/40 transition-all duration-300 cursor-pointer"
                        onClick={() => handleDetailClick(impl)}
                      >
                        {/* Top accent bar */}
                        <div className="h-1 bg-gradient-to-r from-primary via-primary/80 to-primary/60" />
                        
                        <CardHeader className="pb-3 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <CardTitle className="text-lg lg:text-xl text-white font-bold leading-tight group-hover:text-primary-foreground transition-colors">
                                {impl.name}
                              </CardTitle>
                              {impl.category && (
                                <div className="flex items-center gap-2 mt-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                  <span className="text-white/60 text-sm">{impl.category}</span>
                                </div>
                              )}
                            </div>
                            {impl.availability === 'coming_soon' && (
                              <Badge className="shrink-0 bg-amber-500/20 text-amber-300 border-amber-500/30 backdrop-blur-sm">
                                <Timer className="w-3 h-3 mr-1" />
                                Em Breve
                              </Badge>
                            )}
                          </div>
                          
                          {impl.tags && impl.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {impl.tags.map(tag => (
                                <Badge 
                                  key={tag} 
                                  variant="outline" 
                                  className={`text-xs gap-1 backdrop-blur-sm ${getTagStyles(tag)}`}
                                >
                                  {getTagIcon(tag)}
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </CardHeader>
                        
                        <CardContent className="pb-4 flex-1">
                          <p className="text-white/70 text-sm leading-relaxed line-clamp-3">
                            {impl.short_description || impl.description || 'Módulo para potencializar seu sistema'}
                          </p>
                          
                          <div className="mt-6 flex items-end gap-2">
                            <span className="text-3xl font-bold text-white">
                              {new Intl.NumberFormat('pt-BR', { 
                                style: 'currency', 
                                currency: 'BRL' 
                              }).format(impl.value)}
                            </span>
                            <span className="text-white/50 text-sm mb-1">único</span>
                          </div>
                        </CardContent>
                        
                        <CardFooter className="pt-4 border-t border-white/10">
                          {isAlreadyRequested(impl.id) ? (
                            <Button 
                              variant="secondary" 
                              className="w-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30" 
                              disabled
                              onClick={(e) => e.stopPropagation()}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Já Solicitado
                            </Button>
                          ) : impl.availability === 'coming_soon' ? (
                            <Button 
                              variant="outline" 
                              className="w-full border-white/20 text-white/70 hover:bg-white/10" 
                              disabled
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Timer className="w-4 h-4 mr-2" />
                              Em Breve
                            </Button>
                          ) : (
                            <Button 
                              className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-semibold shadow-lg shadow-primary/25 group/btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRequestClick(impl);
                              }}
                            >
                              <Zap className="w-4 h-4 mr-2 group-hover/btn:animate-pulse" />
                              Quero esse módulo
                              <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                            </Button>
                          )}
                        </CardFooter>
                      </Card>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </TabsContent>

            <TabsContent value="history" className="relative z-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="bg-white/10 backdrop-blur-xl border-white/20 shadow-2xl">
                  <CardHeader className="border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white/10">
                        <History className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-white text-xl">Histórico de Solicitações</CardTitle>
                        <CardDescription className="text-white/60">
                          Acompanhe o status das suas solicitações de implantação
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    {requests.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                          <Package className="w-10 h-10 text-white/30" />
                        </div>
                        <p className="text-white/70 text-lg mb-2">Nenhuma solicitação ainda</p>
                        <p className="text-white/50 text-sm">Explore os módulos disponíveis e faça sua primeira solicitação</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <AnimatePresence>
                          {requests.map((req, index) => {
                            const statusInfo = getStatusInfo(req.status);
                            return (
                              <motion.div
                                key={req.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20, height: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="flex items-center justify-between p-5 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl hover:bg-white/10 transition-colors gap-4"
                              >
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-white text-lg truncate">
                                    {req.implementation?.name || 'Implantação'}
                                  </h4>
                                  <p className="text-white/50 text-sm mt-1">
                                    Solicitado em {format(new Date(req.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                                  </p>
                                  {req.notes && (
                                    <p className="text-white/60 text-sm mt-2 italic border-l-2 border-white/20 pl-3 line-clamp-2">
                                      "{req.notes}"
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right space-y-2">
                                    <Badge className={`${statusInfo.bgColor} ${statusInfo.color} border gap-1`}>
                                      {statusInfo.icon}
                                      {statusInfo.label}
                                    </Badge>
                                    {req.implementation && (
                                      <p className="text-white font-semibold">
                                        {new Intl.NumberFormat('pt-BR', { 
                                          style: 'currency', 
                                          currency: 'BRL' 
                                        }).format(req.implementation.value)}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteRequest(req.id)}
                                    disabled={deletingRequestId === req.id}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/20 shrink-0"
                                    title="Excluir solicitação"
                                  >
                                    {deletingRequestId === req.id ? (
                                      <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                                    ) : (
                                      <Trash2 className="w-4 h-4" />
                                    )}
                                  </Button>
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Detail Dialog */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 shrink-0">
                  <Package className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <DialogTitle className="text-xl mb-1">{selectedImpl?.name}</DialogTitle>
                  {selectedImpl?.category && (
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span className="text-muted-foreground text-sm">{selectedImpl.category}</span>
                    </div>
                  )}
                </div>
              </div>
            </DialogHeader>
            
            <div className="py-4 space-y-5">
              {/* Tags */}
              {selectedImpl?.tags && selectedImpl.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedImpl.tags.map(tag => (
                    <Badge 
                      key={tag} 
                      variant="outline" 
                      className={`text-xs gap-1 ${
                        tag.toLowerCase() === 'novo' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' :
                        tag.toLowerCase() === 'popular' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' :
                        tag.toLowerCase() === 'em breve' ? 'bg-sky-500/10 text-sky-600 border-sky-500/30' :
                        ''
                      }`}
                    >
                      {getTagIcon(tag)}
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              
              {/* Description */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Descrição</h4>
                <div className="p-4 bg-muted/50 rounded-xl">
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {selectedImpl?.description || selectedImpl?.short_description || 'Sem descrição disponível'}
                  </p>
                </div>
              </div>
              
              {/* Price */}
              <div className="p-5 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl border border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Valor do módulo</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-primary">
                        {selectedImpl && new Intl.NumberFormat('pt-BR', { 
                          style: 'currency', 
                          currency: 'BRL' 
                        }).format(selectedImpl.value)}
                      </span>
                      <span className="text-muted-foreground text-sm">pagamento único</span>
                    </div>
                  </div>
                  {selectedImpl?.availability === 'coming_soon' && (
                    <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">
                      <Timer className="w-3 h-3 mr-1" />
                      Em Breve
                    </Badge>
                  )}
                </div>
              </div>
              
              {/* Info */}
              <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg text-sm text-muted-foreground">
                <Shield className="w-4 h-4 shrink-0" />
                <span>Após solicitar, nossa equipe entrará em contato para agendar a implantação</span>
              </div>
            </div>
            
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
                Fechar
              </Button>
              {selectedImpl && !isAlreadyRequested(selectedImpl.id) && selectedImpl.availability !== 'coming_soon' && (
                <Button 
                  onClick={() => selectedImpl && handleRequestClick(selectedImpl)}
                  className="bg-gradient-to-r from-primary to-primary/80"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Quero esse módulo
                </Button>
              )}
              {selectedImpl && isAlreadyRequested(selectedImpl.id) && (
                <Button disabled className="bg-emerald-500/20 text-emerald-600 border border-emerald-500/30">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Já Solicitado
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Request Dialog */}
        <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Rocket className="w-5 h-5 text-primary" />
                </div>
                <DialogTitle className="text-xl">Solicitar Implantação</DialogTitle>
              </div>
              <DialogDescription>
                Você está solicitando o módulo:
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl border border-primary/20">
                <h3 className="font-bold text-lg text-foreground mb-2">{selectedImpl?.name}</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-primary">
                    {selectedImpl && new Intl.NumberFormat('pt-BR', { 
                      style: 'currency', 
                      currency: 'BRL' 
                    }).format(selectedImpl.value)}
                  </span>
                  <span className="text-muted-foreground text-sm">pagamento único</span>
                </div>
              </div>
              
              {/* Payment Type Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Como você vai pagar?</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentType('avista')}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                      paymentType === 'avista'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    <Banknote className={`w-6 h-6 ${paymentType === 'avista' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-semibold">À Vista</span>
                    <span className="text-xs text-muted-foreground">Pagamento único</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentType('parcelado')}
                    className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                      paymentType === 'parcelado'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    <CreditCard className={`w-6 h-6 ${paymentType === 'parcelado' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-semibold">Parcelado</span>
                    <span className="text-xs text-muted-foreground">Em até 12x</span>
                  </button>
                </div>
                
                {/* Installments selector - shown when parcelado is selected */}
                {paymentType === 'parcelado' && (
                  <div className="p-4 bg-muted/30 rounded-xl border border-border space-y-3">
                    <Label className="text-sm font-medium">Em quantas vezes?</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {[2, 3, 6, 12].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setInstallments(num)}
                          className={`p-3 rounded-lg border-2 transition-all flex items-center justify-center ${
                            installments === num
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:border-primary/50 hover:bg-muted/50'
                          }`}
                        >
                          <span className="font-bold text-lg">{num}x</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm font-medium">
                  Observações <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Textarea
                  id="notes"
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="Alguma necessidade específica ou informação adicional?"
                  rows={3}
                  className="resize-none"
                />
              </div>
              
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                <Shield className="w-4 h-4 shrink-0" />
                <span>Nossa equipe entrará em contato para agendar a implantação</span>
              </div>
            </div>
            
            <DialogFooter className="flex-shrink-0 gap-2 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setIsRequestDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSubmitRequest} 
                disabled={submitting}
                className="bg-gradient-to-r from-primary to-primary/80"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Confirmar Solicitação
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ClientImplementations;
