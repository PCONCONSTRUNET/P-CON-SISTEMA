import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ExternalLink, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import logo from '@/assets/logo-pcon-grande.png';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

interface PortfolioItem {
  id: string;
  title: string;
  description: string | null;
  project_url: string | null;
  image_urls: string[];
}

const PortfolioPublic = () => {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPortfolioItems();
  }, []);

  const fetchPortfolioItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('portfolio_items')
        .select('*')
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error fetching portfolio items:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-border/50">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <img src={logo} alt="P-CON" className="h-12 w-auto brightness-0 invert opacity-90" />
          <h1 className="text-xl font-bold text-foreground">Portfólio</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 pt-32 pb-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-500">
            Nossos Projetos
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Conheça alguns dos trabalhos que desenvolvemos com excelência e dedicação.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-muted-foreground py-20 glass-card rounded-2xl">
            <p>Nenhum projeto encontrado no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
            {items.map((item) => (
              <div 
                key={item.id} 
                className="glass-card rounded-2xl overflow-hidden group hover:border-primary/50 transition-colors flex flex-col"
              >
                <div className="aspect-[4/5] sm:aspect-square w-full relative bg-black/5 dark:bg-white/5">
                  {item.image_urls && item.image_urls.length > 1 ? (
                    <Carousel className="absolute inset-0">
                      <CarouselContent className="h-full ml-0">
                        {item.image_urls.map((url, index) => (
                          <CarouselItem key={index} className="pl-0 h-full relative">
                            <div className="absolute inset-0 p-4 flex items-center justify-center">
                              <img 
                                src={url} 
                                alt={`${item.title} - Imagem ${index + 1}`}
                                className="max-w-full max-h-full object-contain drop-shadow-lg transition-transform duration-500 group-hover:scale-105"
                              />
                            </div>
                          </CarouselItem>
                        ))}
                      </CarouselContent>
                      <CarouselPrevious className="left-2 bg-background/80 hover:bg-background border-none shadow-sm h-6 w-6 sm:h-8 sm:w-8" />
                      <CarouselNext className="right-2 bg-background/80 hover:bg-background border-none shadow-sm h-6 w-6 sm:h-8 sm:w-8" />
                    </Carousel>
                  ) : (
                    <div className="absolute inset-0 p-2 sm:p-4 flex items-center justify-center">
                      <img 
                        src={item.image_urls?.[0] || ''} 
                        alt={item.title}
                        className="max-w-full max-h-full object-contain drop-shadow-lg transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  )}
                </div>
                <div className="p-3 sm:p-6 flex flex-col flex-grow">
                  <h3 className="text-base sm:text-xl font-bold mb-1 sm:mb-2 text-foreground line-clamp-2">{item.title}</h3>
                  {item.description && (
                    <p className="text-xs sm:text-base text-muted-foreground line-clamp-2 sm:line-clamp-3 mb-3 sm:mb-4 flex-grow">
                      {item.description}
                    </p>
                  )}
                  {item.project_url && (
                    <div className="mt-auto pt-2 sm:pt-4">
                      <a 
                        href={item.project_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 sm:gap-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground px-2 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium text-xs sm:text-base transition-colors w-full justify-center"
                      >
                        <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="truncate">Acessar Projeto</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PortfolioPublic;
