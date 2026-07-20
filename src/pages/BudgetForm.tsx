import { useState } from 'react';
import { Download, Loader2, Plus, Trash2, GripVertical, Sparkles } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { generatePConProposalPDF, PConProposalData } from '@/utils/pconPdfGenerator';
import { toast } from 'sonner';

const BudgetForm = () => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  
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

  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Digite como você quer o orçamento.');
      return;
    }

    setIsGeneratingAI(true);
    try {
      const systemPrompt = `Você é um assistente especialista em criar propostas comerciais e orçamentos profissionais.
O usuário vai fornecer uma descrição do orçamento que deseja.
Sua tarefa é retornar APENAS um objeto JSON válido, contendo os seguintes campos exatamente nesta estrutura:
{
  "clientName": "Nome do cliente (invente um se não fornecido ou deixe genérico)",
  "tables": [
    {
      "title": "Título da tabela de preços (ex: Investimento, Serviços)",
      "items": [
        { "item": "Descrição do serviço/produto", "value": "Valor formatado em R$ (ex: 1.500,00)" }
      ]
    }
  ],
  "textSections": [
    {
      "title": "Título da seção (ex: Escopo do Projeto, Prazos, Observações)",
      "items": [ "Parágrafo ou item da seção" ]
    }
  ]
}
Sempre crie pelo menos uma tabela com os valores solicitados (ou valores de mercado se não informados) e pelo menos duas seções de texto (ex: Escopo e Prazos/Condições). Não coloque blocos de formatação markdown (\`\`\`json). Apenas o JSON puro.`;

      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: aiPrompt }
          ],
          jsonMode: true
        })
      });

      if (!res.ok) throw new Error('Erro na API de IA');
      
      const responseText = await res.text();
      let parsedData;
      try {
        // Tratar caso a IA ainda envie os backticks de markdown
        const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedData = JSON.parse(cleanedText);
      } catch (e) {
        console.error('Erro ao fazer parse do JSON:', responseText);
        throw new Error('Formato de resposta inválido da IA');
      }

      setForm({
        clientName: parsedData.clientName || '',
        tables: parsedData.tables && parsedData.tables.length > 0 ? parsedData.tables : [{ title: 'Serviços', items: [{ item: '', value: '' }] }],
        textSections: parsedData.textSections && parsedData.textSections.length > 0 ? parsedData.textSections : [{ title: 'Observações', items: [''] }]
      });
      
      toast.success('Orçamento gerado pela IA com sucesso!');
      setAiPrompt('');
    } catch (error) {
      console.error('Error generating AI budget:', error);
      toast.error('Erro ao gerar orçamento com IA. Tente novamente.');
    } finally {
      setIsGeneratingAI(false);
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
        
        {/* IA GENERATOR */}
        <Card className="glass-card border-primary/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Sparkles className="w-24 h-24 text-primary" />
          </div>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Sparkles className="w-5 h-5" />
              Gerar Orçamento com IA (Gratuito)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 relative z-10">
              <Textarea 
                placeholder="Ex: Quero um orçamento para o João, referente à criação de um site institucional por R$ 2500, prazo de 15 dias, 50% de entrada."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                className="min-h-[100px] resize-none bg-background/50"
              />
              <Button 
                onClick={handleGenerateAI} 
                disabled={isGeneratingAI || !aiPrompt.trim()}
                className="w-full sm:w-auto font-semibold"
              >
                {isGeneratingAI ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {isGeneratingAI ? 'Gerando Mágica...' : 'Gerar Orçamento Completo'}
              </Button>
            </div>
          </CardContent>
        </Card>

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
            <Card key={tIndex} className="glass-card border-l-4 border-l-primary">
              <CardHeader className="flex flex-row items-start justify-between pb-3 gap-4">
                <Input 
                  className="text-lg font-semibold bg-transparent border-none px-0 h-auto flex-1 focus-visible:ring-0 shadow-none placeholder:text-muted-foreground/50"
                  value={table.title}
                  placeholder="Título da Tabela (Ex: Catálogo Atual, Serviços)"
                  onChange={(e) => updateTableTitle(tIndex, e.target.value)}
                />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground shrink-0 mt-0"
                  onClick={() => removeTable(tIndex)}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
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
            <Card key={sIndex} className="glass-card border-l-4 border-l-primary">
              <CardHeader className="flex flex-row items-start justify-between pb-3 gap-4">
                <Input 
                  className="text-lg font-semibold bg-transparent border-none px-0 h-auto flex-1 focus-visible:ring-0 shadow-none placeholder:text-muted-foreground/50"
                  value={section.title}
                  placeholder="Título da Seção (Ex: Resumo Financeiro, Cortesia Exclusiva)"
                  onChange={(e) => updateTextSectionTitle(sIndex, e.target.value)}
                />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground shrink-0 mt-0"
                  onClick={() => removeTextSection(sIndex)}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
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