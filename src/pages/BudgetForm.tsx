import { useState } from 'react';
import { Download, Loader2, Plus, Trash2, GripVertical } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generatePConProposalPDF, PConProposalData } from '@/utils/pconPdfGenerator';
import { toast } from 'sonner';

const BudgetForm = () => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  
  // Estrutura neutra e dinâmica
  const [form, setForm] = useState<PConProposalData>({
    clientName: '',
    tables: [
      {
        title: 'Serviços / Produtos',
        items: [
          { item: '', value: '' }
        ]
      }
    ],
    textSections: [
      {
        title: 'Resumo Financeiro',
        items: ['']
      },
      {
        title: 'Observações',
        items: ['']
      }
    ]
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

  // --- Funções para Tabelas Dinâmicas ---
  const addTable = () => {
    setForm(current => ({
      ...current,
      tables: [...current.tables, { title: 'Nova Tabela', items: [{ item: '', value: '' }] }]
    }));
  };

  const removeTable = (tableIndex: number) => {
    setForm(current => {
      const newTables = [...current.tables];
      newTables.splice(tableIndex, 1);
      return { ...current, tables: newTables };
    });
  };

  const updateTableTitle = (tableIndex: number, title: string) => {
    setForm(current => {
      const newTables = [...current.tables];
      newTables[tableIndex].title = title;
      return { ...current, tables: newTables };
    });
  };

  const addTableItem = (tableIndex: number) => {
    setForm(current => {
      const newTables = [...current.tables];
      newTables[tableIndex].items.push({ item: '', value: '' });
      return { ...current, tables: newTables };
    });
  };

  const updateTableItem = (tableIndex: number, itemIndex: number, field: 'item' | 'value', val: string) => {
    setForm(current => {
      const newTables = [...current.tables];
      newTables[tableIndex].items[itemIndex][field] = val;
      return { ...current, tables: newTables };
    });
  };

  const removeTableItem = (tableIndex: number, itemIndex: number) => {
    setForm(current => {
      const newTables = [...current.tables];
      newTables[tableIndex].items.splice(itemIndex, 1);
      return { ...current, tables: newTables };
    });
  };

  // --- Funções para Seções de Texto Dinâmicas ---
  const addTextSection = () => {
    setForm(current => ({
      ...current,
      textSections: [...current.textSections, { title: 'Nova Seção', items: [''] }]
    }));
  };

  const removeTextSection = (sectionIndex: number) => {
    setForm(current => {
      const newSections = [...current.textSections];
      newSections.splice(sectionIndex, 1);
      return { ...current, textSections: newSections };
    });
  };

  const updateTextSectionTitle = (sectionIndex: number, title: string) => {
    setForm(current => {
      const newSections = [...current.textSections];
      newSections[sectionIndex].title = title;
      return { ...current, textSections: newSections };
    });
  };

  const addTextSectionItem = (sectionIndex: number) => {
    setForm(current => {
      const newSections = [...current.textSections];
      newSections[sectionIndex].items.push('');
      return { ...current, textSections: newSections };
    });
  };

  const updateTextSectionItem = (sectionIndex: number, itemIndex: number, val: string) => {
    setForm(current => {
      const newSections = [...current.textSections];
      newSections[sectionIndex].items[itemIndex] = val;
      return { ...current, textSections: newSections };
    });
  };

  const removeTextSectionItem = (sectionIndex: number, itemIndex: number) => {
    setForm(current => {
      const newSections = [...current.textSections];
      newSections[sectionIndex].items.splice(itemIndex, 1);
      return { ...current, textSections: newSections };
    });
  };

  return (
    <DashboardLayout
      title="Gerador de Orçamento em PDF"
      subtitle="Crie propostas comerciais dinâmicas e neutras"
      headerAction={
        <Button onClick={handleDownloadPdf} disabled={downloadingPdf}>
          {downloadingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Baixar PDF
        </Button>
      }
    >
      <div className="space-y-8 max-w-4xl mx-auto pb-10">
        
        {/* IDENTIFICAÇÃO */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Identificação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="client-name">Nome do Cliente / Empresa</Label>
              <Input 
                id="client-name" 
                placeholder="Ex: Ateliê Mimos da Preta"
                value={form.clientName} 
                onChange={(e) => setForm({ ...form, clientName: e.target.value })} 
              />
            </div>
          </CardContent>
        </Card>

        {/* TABELAS DE PREÇO / SERVIÇOS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Tabelas de Preços</h2>
            <Button variant="secondary" onClick={addTable}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Tabela
            </Button>
          </div>
          
          {form.tables.map((table, tIndex) => (
            <Card key={tIndex} className="glass-card border-l-4 border-l-primary relative">
              <Button 
                variant="destructive" 
                size="icon" 
                className="absolute -right-3 -top-3 h-8 w-8 rounded-full shadow-md"
                onClick={() => removeTable(tIndex)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Input 
                    className="text-lg font-semibold bg-transparent border-none px-0 h-auto w-full focus-visible:ring-0"
                    value={table.title}
                    placeholder="Título da Tabela (Ex: Catálogo Atual, Serviços)"
                    onChange={(e) => updateTableTitle(tIndex, e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {table.items.map((row, iIndex) => (
                  <div key={iIndex} className="flex items-center gap-2">
                    <Input 
                      placeholder="Descrição do Item" 
                      value={row.item} 
                      className="flex-1"
                      onChange={e => updateTableItem(tIndex, iIndex, 'item', e.target.value)} 
                    />
                    <Input 
                      placeholder="Valor (R$)" 
                      value={row.value} 
                      className="w-32 md:w-48"
                      onChange={e => updateTableItem(tIndex, iIndex, 'value', e.target.value)} 
                    />
                    <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => removeTableItem(tIndex, iIndex)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => addTableItem(tIndex)}>
                  <Plus className="w-4 h-4 mr-2" /> Adicionar Linha
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* SEÇÕES DE TEXTO */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Seções de Informação</h2>
            <Button variant="secondary" onClick={addTextSection}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Seção
            </Button>
          </div>

          {form.textSections.map((section, sIndex) => (
            <Card key={sIndex} className="glass-card border-l-4 border-l-primary relative">
              <Button 
                variant="destructive" 
                size="icon" 
                className="absolute -right-3 -top-3 h-8 w-8 rounded-full shadow-md"
                onClick={() => removeTextSection(sIndex)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <CardHeader className="pb-3">
                <Input 
                  className="text-lg font-semibold bg-transparent border-none px-0 h-auto w-full focus-visible:ring-0"
                  value={section.title}
                  placeholder="Título da Seção (Ex: Resumo Financeiro, Cortesia Exclusiva)"
                  onChange={(e) => updateTextSectionTitle(sIndex, e.target.value)}
                />
              </CardHeader>
              <CardContent className="space-y-3">
                {section.items.map((text, iIndex) => (
                  <div key={iIndex} className="flex items-start gap-2">
                    <Input 
                      value={text} 
                      placeholder="Adicione uma informação ou tópico..."
                      onChange={e => updateTextSectionItem(sIndex, iIndex, e.target.value)} 
                    />
                    <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 shrink-0" onClick={() => removeTextSectionItem(sIndex, iIndex)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => addTextSectionItem(sIndex)}>
                  <Plus className="w-4 h-4 mr-2" /> Adicionar Linha
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button className="w-full h-14 text-lg font-bold mt-8 shadow-lg" onClick={handleDownloadPdf} disabled={downloadingPdf}>
          {downloadingPdf ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : <Download className="w-6 h-6 mr-2" />}
          GERAR PDF DA PROPOSTA
        </Button>
      </div>
    </DashboardLayout>
  );
};

export default BudgetForm;