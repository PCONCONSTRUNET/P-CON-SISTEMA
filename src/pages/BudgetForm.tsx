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



        <Button className="w-full h-14 text-lg font-bold mt-8 shadow-lg" onClick={handleDownloadPdf} disabled={downloadingPdf}>
          {downloadingPdf ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : <Download className="w-6 h-6 mr-2" />}
          GERAR PDF DA PROPOSTA
        </Button>
      </div>
    </DashboardLayout>
  );
};

export default BudgetForm;