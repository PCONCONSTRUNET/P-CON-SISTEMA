import { useState } from 'react';
import { Download, Loader2, Plus, Trash2 } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generatePConProposalPDF, PConProposalData } from '@/utils/pconPdfGenerator';
import { toast } from 'sonner';

const BudgetForm = () => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [form, setForm] = useState<PConProposalData>({
    clientName: 'Ateliê Mimos da Preta',
    currentCatalogItems: [
      { item: 'Mensalidade', value: 'R$ 55,00' },
      { item: 'Entrega', value: 'R$ 0,00 (Promoção Dia das Mães)' },
    ],
    newProposalItems: [
      { item: 'Novo catálogo (layout exclusivo e personalizado)', value: '' },
      { item: 'Mensalidade', value: 'R$ 65,00' },
      { item: 'Entrega', value: 'R$ 300,00' },
    ],
    financialSummary: [
      'Total mensal (2 catálogos ativos): R$ 120,00',
      'Entrega do novo catálogo: R$ 300,00 (aceitamos parcelamento)',
    ],
    includedItems: [
      'Suporte completo em ambos os catálogos.',
      'Atendimento e acompanhamento contínuo.',
      'Exclusividade de Lucas Pereira para adicionar fotos, organizar e manter o catálogo da proprietária do Ateliê.',
    ],
    courtesyItems: [
      'Sistema de Cupons.',
      'Sistema de Carrinho (clientes poderão montar pedidos diretamente pelo catálogo).',
      'Essas funcionalidades serão disponibilizadas nos dois catálogos.',
    ],
  });

  const handleDownloadPdf = async () => {
    if (!form.clientName.trim()) {
      toast.error('Informe o nome do cliente');
      return;
    }

    setDownloadingPdf(true);
    try {
      await generatePConProposalPDF(form);
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Error generating proposal PDF:', error);
      toast.error('Erro ao gerar PDF da proposta');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const updateArrayItem = (field: keyof PConProposalData, index: number, value: any) => {
    setForm(current => {
      const arr = [...(current[field] as any[])];
      arr[index] = value;
      return { ...current, [field]: arr };
    });
  };

  const addArrayItem = (field: keyof PConProposalData, defaultVal: any) => {
    setForm(current => ({
      ...current,
      [field]: [...(current[field] as any[]), defaultVal]
    }));
  };

  const removeArrayItem = (field: keyof PConProposalData, index: number) => {
    setForm(current => {
      const arr = [...(current[field] as any[])];
      arr.splice(index, 1);
      return { ...current, [field]: arr };
    });
  };

  return (
    <DashboardLayout
      title="Novo Orçamento em PDF"
      subtitle="Gere a proposta comercial com layout da P-CON"
      headerAction={
        <Button onClick={handleDownloadPdf} disabled={downloadingPdf}>
          {downloadingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Baixar PDF
        </Button>
      }
    >
      <div className="space-y-6 max-w-4xl mx-auto pb-10">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Identificação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="client-name">Nome do Cliente / Empresa</Label>
              <Input 
                id="client-name" 
                value={form.clientName} 
                onChange={(e) => setForm({ ...form, clientName: e.target.value })} 
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Catálogo Atual</CardTitle>
              <Button size="sm" variant="outline" onClick={() => addArrayItem('currentCatalogItems', { item: '', value: '' })}>
                <Plus className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {form.currentCatalogItems.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input 
                    placeholder="Item" 
                    value={row.item} 
                    onChange={e => updateArrayItem('currentCatalogItems', index, { ...row, item: e.target.value })} 
                  />
                  <Input 
                    placeholder="Valor" 
                    value={row.value} 
                    onChange={e => updateArrayItem('currentCatalogItems', index, { ...row, value: e.target.value })} 
                  />
                  <Button size="icon" variant="destructive" onClick={() => removeArrayItem('currentCatalogItems', index)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {form.currentCatalogItems.length === 0 && <p className="text-sm text-muted-foreground text-center">Nenhum item adicionado.</p>}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Nova Proposta</CardTitle>
              <Button size="sm" variant="outline" onClick={() => addArrayItem('newProposalItems', { item: '', value: '' })}>
                <Plus className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {form.newProposalItems.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input 
                    placeholder="Item" 
                    value={row.item} 
                    onChange={e => updateArrayItem('newProposalItems', index, { ...row, item: e.target.value })} 
                  />
                  <Input 
                    placeholder="Valor" 
                    value={row.value} 
                    onChange={e => updateArrayItem('newProposalItems', index, { ...row, value: e.target.value })} 
                  />
                  <Button size="icon" variant="destructive" onClick={() => removeArrayItem('newProposalItems', index)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {form.newProposalItems.length === 0 && <p className="text-sm text-muted-foreground text-center">Nenhum item adicionado.</p>}
            </CardContent>
          </Card>
        </div>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Resumo Financeiro</CardTitle>
            <Button size="sm" variant="outline" onClick={() => addArrayItem('financialSummary', '')}>
              <Plus className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {form.financialSummary.map((text, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input 
                  value={text} 
                  onChange={e => updateArrayItem('financialSummary', index, e.target.value)} 
                />
                <Button size="icon" variant="destructive" onClick={() => removeArrayItem('financialSummary', index)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Incluso sem custo adicional</CardTitle>
            <Button size="sm" variant="outline" onClick={() => addArrayItem('includedItems', '')}>
              <Plus className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {form.includedItems.map((text, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input 
                  value={text} 
                  onChange={e => updateArrayItem('includedItems', index, e.target.value)} 
                />
                <Button size="icon" variant="destructive" onClick={() => removeArrayItem('includedItems', index)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Cortesia Exclusiva</CardTitle>
            <Button size="sm" variant="outline" onClick={() => addArrayItem('courtesyItems', '')}>
              <Plus className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {form.courtesyItems.map((text, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input 
                  value={text} 
                  onChange={e => updateArrayItem('courtesyItems', index, e.target.value)} 
                />
                <Button size="icon" variant="destructive" onClick={() => removeArrayItem('courtesyItems', index)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Button className="w-full h-12 text-lg mt-8" onClick={handleDownloadPdf} disabled={downloadingPdf}>
          {downloadingPdf ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : <Download className="w-6 h-6 mr-2" />}
          GERAR PDF
        </Button>
      </div>
    </DashboardLayout>
  );
};

export default BudgetForm;