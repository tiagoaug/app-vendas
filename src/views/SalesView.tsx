import { useState, useMemo } from 'react';
import { Sale, SaleType, PaymentStatus, Product, Grid, SaleStatus, Person, PaymentMethod, Account, PaymentTerm } from '../types';
import { ShoppingBag, TrendingUp, User, Calendar, Tag, Filter, Plus, Hash, Clock, CheckCircle2, AlertCircle, MoreVertical, Edit2, Trash2, X, Info, Box, Ban, RotateCcw, Search, MessageSquare, Copy, Share, DollarSign, History, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import SalePaymentModal from '../components/SalePaymentModal';

interface SalesViewProps {
  sales: Sale[];
  products: Product[];
  grids: Grid[];
  people: Person[];
  paymentMethods: PaymentMethod[];
  accounts: Account[];
  onAdd: () => void;
  onEdit: (sale: Sale) => void;
  onDelete: (id: string) => void;
  onCancelOnly: (id: string) => void;
  onConvert: (id: string) => void;
  onPaySale: (saleId: string, amount: number, accountId: string, paymentMethodId: string, note: string) => Promise<void>;
  onUpdatePayment: (saleId: string, paymentId: string, amount: number, accountId: string, paymentMethodId: string, note: string) => Promise<void>;
  onDeletePayment: (saleId: string, paymentId: string) => Promise<void>;
  isDarkMode: boolean;
  initialSearchQuery?: string;
}

export default function SalesView({ 
  sales, 
  products, 
  grids, 
  people,
  paymentMethods,
  accounts,
  onAdd, 
  onEdit, 
  onDelete, 
  onCancelOnly, 
  onConvert, 
  onPaySale,
  onUpdatePayment,
  onDeletePayment,
  isDarkMode,
  initialSearchQuery = ''
}: SalesViewProps) {
  const [filter, setFilter] = useState<'ALL' | 'RETAIL' | 'WHOLESALE'>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL');
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedStatuses, setSelectedStatuses] = useState<SaleStatus[]>([SaleStatus.SALE, SaleStatus.QUOTE]);
  const [showFilters, setShowFilters] = useState(false);
  const [showOptionsId, setShowOptionsId] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [paymentModalSale, setPaymentModalSale] = useState<Sale | null>(null);
  const [paymentModalMode, setPaymentModalMode] = useState<'PAYMENT' | 'HISTORY'>('PAYMENT');
  const [whatsappMode, setWhatsappMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [editingMessage, setEditingMessage] = useState<{ sale: Sale, text: string } | null>(null);
  const [noteModal, setNoteModal] = useState<{ isOpen: boolean, note: string } | null>(null);

  // Mapas para busca rápida O(1)
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach(p => map.set(p.id, p));
    return map;
  }, [products]);

  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      // Filter by Type (Retail/Wholesale)
      if (filter !== 'ALL') {
        const hasType = s.items.some(item => item.saleType === filter);
        if (!hasType) return false;
      }

      // Filter by Payment Status
      if (paymentFilter !== 'ALL') {
        if (paymentFilter === 'PAID' && s.paymentStatus !== PaymentStatus.PAID) return false;
        if (paymentFilter === 'PENDING' && s.paymentStatus !== PaymentStatus.PENDING) return false;
      }

      // Filter by Status
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(s.status)) {
        return false;
      }

      // Filter by Search Query (Name or ID)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = s.customerName?.toLowerCase().includes(query);
        const matchesId = s.orderNumber?.toLowerCase().includes(query);
        if (!matchesName && !matchesId) return false;
      }

      return true;
    }).sort((a, b) => b.date - a.date); // Mais recentes primeiro
  }, [sales, filter, paymentFilter, selectedStatuses, searchQuery]);

  const getProductInfo = (productId: string) => productMap.get(productId);

  const getVariationInfo = (productId: string, variationId: string) => {
    const product = getProductInfo(productId);
    return product?.variations.find(v => v.id === variationId);
  };

  const generateMessage = (sale: Sale) => {
    const customer = people.find(p => p.id === sale.customerId);
    
    const itemsText = sale.items.map(item => {
      const p = products.find(prod => prod.id === item.productId);
      const v = p?.variations.find(varItem => varItem.id === item.variationId);
      const variantDesc = v?.colorName ? ` (${v.colorName})` : '';
      const sizeDesc = item.size ? ` (TAM ${item.size})` : '';
      const typeDesc = item.saleType === SaleType.RETAIL ? 'pares' : 'grades';
      
      return `📦 *${p?.name}${variantDesc}*${sizeDesc}\n   Qtd: ${item.quantity} ${typeDesc}\n   Un: R$ ${item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n   Sub: R$ ${(item.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }).join('\n\n');

    const paymentMethod = paymentMethods.find(pm => pm.id === sale.paymentMethodId);
    const paymentInfo = paymentMethod?.value ? `\n\n💳 *Pagamento: ${paymentMethod.name}*\nchave pix: ${paymentMethod.value}` : `\n\n💳 *Pagamento: ${paymentMethod?.name || 'A definir'}*`;

    const statusText = sale.status === SaleStatus.QUOTE ? 'ORÇAMENTO' : 'PEDIDO';
    const discountText = sale.discount > 0 ? `\n📉 *Desconto:* R$ ${sale.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';

    return `Olá ${customer?.name || sale.customerName || 'Cliente'}!\n\nSeu ${statusText} #${sale.orderNumber}.\n\n*ITENS:*\n${itemsText}\n\n------------------\n💰 *Subtotal:* R$ ${sale.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${discountText}\n💎 *TOTAL: R$ ${sale.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n------------------\nStatus: ${statusText}${paymentInfo}\n\nAguardamos sua confirmação!`;
  };

  const handleCopyMessage = (sale: Sale) => {
    const message = generateMessage(sale);
    navigator.clipboard.writeText(message);
    alert('Mensagem copiada!');
  };

  const handleShareWhatsApp = (sale: Sale, customMessage?: string) => {
    const customer = people.find(p => p.id === sale.customerId);
    if (!customer?.phone && !customMessage) {
      alert('Cliente sem telefone cadastrado.');
    }
    
    if (whatsappMode === 'MANUAL' && !customMessage) {
      setEditingMessage({ sale, text: generateMessage(sale) });
      return;
    }

    const message = customMessage || generateMessage(sale);
    const encodedMessage = encodeURIComponent(message);
    const phone = customer?.phone?.replace(/\D/g, '') || '';
    window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
    if (customMessage) setEditingMessage(null);
  };

  return (
    <div className="flex flex-col gap-6 h-full pb-44 px-1 overflow-y-auto force-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl">
            <ShoppingBag className="text-emerald-600 dark:text-emerald-400" size={24} strokeWidth={2.5} />
          </div>
          <h2 className={`text-xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
            Loja Virtual & Vendas
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          <button className={`p-2.5 rounded-xl transition-all ${isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-50 text-slate-400'}`}>
            <History size={20} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-[13px] font-black uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Vendas</h2>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest leading-none">Relatórios</p>
          </div>
          
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${showFilters ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
              >
                <Filter size={18} strokeWidth={2.5} />
              </button>

              <div className={`flex p-1 rounded-xl ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
                {(['RETAIL', 'WHOLESALE'] as const).map(f => (
                  <button 
                    key={f}
                    onClick={() => setFilter(filter === f ? 'ALL' : f)}
                    className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${filter === f ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    {f === 'RETAIL' ? <Box size={12} /> : <TrendingUp size={12} />}
                    {f === 'RETAIL' ? 'Varejo' : 'Atacado'}
                  </button>
                ))}
              </div>
            </div>

            <div className={`flex p-1 rounded-xl ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
              {(['ALL', 'PENDING', 'PAID'] as const).map(f => (
                <button 
                  key={f}
                  onClick={() => setPaymentFilter(f)}
                  className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${paymentFilter === f ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
                >
                  {f === 'ALL' ? 'Todos' : f === 'PENDING' ? 'Pendente' : 'Concluído'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className={`transition-all duration-300 ${showFilters || searchQuery ? 'h-auto opacity-100' : 'h-0 opacity-0 overflow-hidden'}`}>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Buscar venda..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full h-14 pl-12 pr-4 rounded-2xl border text-xs font-bold uppercase tracking-widest outline-none transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-100 text-slate-800'}`}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredSales.map((sale) => {
          const totalPaid = (sale.paymentHistory || []).reduce((acc, p) => acc + p.amount, 0);
          const remaining = Math.max(0, sale.total - totalPaid);
          const status = remaining <= 0 ? 'PAID' : 'PENDING';
          const customer = people.find(c => c.id === sale.customerId);

          return (
            <div key={sale.id} className={`p-5 rounded-[2rem] border transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100 shadow-sm'}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <ShoppingBag size={24} strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className={`text-[13px] font-black uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        {customer?.name || sale.customerName || 'Cliente'}
                      </h3>
                      <div className="flex gap-1">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[8px] font-black uppercase tracking-widest">
                          VENDA
                        </span>
                        {status === 'PAID' ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase tracking-widest">
                            QUITADO
                          </span>
                        ) : (
                          <>
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[8px] font-black uppercase tracking-widest">
                              PENDENTE
                            </span>
                            {sale.dueDate && (
                              <span className="px-2 py-0.5 rounded-md bg-red-600 text-white animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.5)] text-[8px] font-black uppercase tracking-widest">
                                VENC: {format(sale.dueDate, "dd/MM/yy", { locale: ptBR })}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                      #{sale.orderNumber} • {format(sale.date, "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              </div>

              <div className={`p-4 rounded-3xl mb-4 flex items-center justify-between ${isDarkMode ? 'bg-slate-800/40' : 'bg-slate-50'}`}>
                <div className="flex gap-8">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total</p>
                    <p className={`text-sm font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      R$ {sale.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Pago</p>
                    <p className={`text-sm font-black tracking-tight ${isDarkMode ? 'text-emerald-500' : 'text-emerald-600'}`}>
                      R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <div className="px-3 py-1 rounded-lg bg-orange-500 text-white text-[8px] font-black uppercase tracking-widest shadow-lg shadow-orange-500/20">
                  {sale.items[0]?.saleType === SaleType.WHOLESALE ? 'ATACADO' : 'VAREJO'}
                </div>
              </div>

              <div 
                onClick={() => setSelectedSale(sale)}
                className="space-y-2 mb-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 p-2 -mx-2 rounded-2xl transition-colors"
              >
                {sale.items.slice(0, 3).map((item, idx) => {
                  const product = getProductInfo(item.productId);
                  const variation = getVariationInfo(item.productId, item.variationId);
                  return (
                    <div key={idx} className="flex items-center justify-between group/item">
                      <div className="flex items-center gap-2">
                        <Tag size={12} className="text-slate-300" />
                        <p className={`text-[10px] font-bold uppercase tracking-tight ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {product?.name} {variation?.colorName} {item.size ? `TAM ${item.size}` : ''}
                        </p>
                      </div>
                      <p className={`text-[10px] font-black ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {item.quantity} {item.saleType === SaleType.WHOLESALE ? 'gr' : 'un'} • R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                      </p>
                    </div>
                  );
                })}
                {sale.items.length > 3 && (
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-5">
                    + {sale.items.length - 3} itens
                  </p>
                )}
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-50 dark:border-slate-800">
                <div className={`flex items-center gap-1.5 p-1.5 rounded-2xl ${isDarkMode ? 'bg-slate-800/80' : 'bg-slate-50 shadow-inner'}`}>
                  <button 
                    onClick={() => handleCopyMessage(sale)}
                    className="p-2 rounded-xl text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all active:scale-95"
                  >
                    <Copy size={16} strokeWidth={2.5} />
                  </button>
                  <button 
                    onClick={() => handleShareWhatsApp(sale)}
                    className="p-2 rounded-xl text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all active:scale-95"
                  >
                    <MessageSquare size={16} strokeWidth={2.5} />
                  </button>
                  <button 
                    onClick={() => {
                      setPaymentModalMode('HISTORY');
                      setPaymentModalSale(sale);
                    }}
                    className="p-2 rounded-xl text-amber-500 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all active:scale-95"
                  >
                    <History size={16} strokeWidth={2.5} />
                  </button>
                  <button 
                    onClick={() => onEdit(sale)}
                    className="p-2 rounded-xl text-blue-500 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-all active:scale-95"
                  >
                    <Edit2 size={16} strokeWidth={2.5} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowOptionsId(showOptionsId === sale.id ? null : sale.id);
                    }}
                    className="p-2 rounded-xl text-slate-500 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
                  >
                    <MoreVertical size={16} strokeWidth={2.5} />
                  </button>
                </div>

                {showOptionsId === sale.id && (
                  <div className="absolute right-6 bottom-16 z-50 min-w-[200px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="p-3 border-b border-slate-50 dark:border-slate-700/50">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Opções Adicionais</p>
                    </div>
                    <div className="p-1.5 space-y-1">
                      {sale.status === SaleStatus.QUOTE && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onConvert(sale.id);
                            setShowOptionsId(null);
                          }}
                          className="w-full flex items-center gap-2.5 p-3 text-left text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all"
                        >
                          <CheckCircle2 size={14} /> Confirmar Venda
                        </button>
                      )}
                      
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaymentModalMode('PAYMENT');
                          setPaymentModalSale(sale);
                          setShowOptionsId(null);
                        }}
                        className="w-full flex items-center gap-2.5 p-3 text-left text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-all"
                      >
                        <DollarSign size={14} /> Registrar Recebimento
                      </button>

                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          // logic for cancelling or deleting if needed
                          setShowOptionsId(null);
                        }}
                        className="w-full flex items-center gap-2.5 p-3 text-left text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all"
                      >
                        <Trash2 size={14} /> Cancelar Venda
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredSales.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-200 dark:text-slate-800">
             <TrendingUp size={64} strokeWidth={1} className="mb-4" />
             <p className="text-[10px] font-black uppercase tracking-widest italic">Sem registro de vendas</p>
          </div>
        )}
      </div>

      <button 
        onClick={onAdd}
        title="Nova Venda"
        aria-label="Criar nova venda"
        className={`fixed bottom-32 right-6 w-14 h-14 bg-slate-900 dark:bg-indigo-600 text-white rounded-[2rem] shadow-2xl flex items-center justify-center active:scale-95 transition-all z-20 border-4 border-white dark:border-slate-800 ${isDarkMode ? 'shadow-none' : 'shadow-slate-300'}`}
      >
         <Plus size={32} strokeWidth={2.5} />
      </button>

      {selectedSale && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedSale(null)}>
          <div 
            className={`w-full max-w-md rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 flex justify-between items-start">
              <div>
                <h3 className={`text-lg font-black uppercase tracking-tight leading-none ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Detalhes do Pedido</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-2 uppercase tracking-[0.2em]">#{selectedSale.orderNumber} • {selectedSale.customerName}</p>
              </div>
              <button 
                onClick={() => setSelectedSale(null)}
                className={`w-10 h-10 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                title="Fechar Detalhes"
                aria-label="Fechar modal de detalhes do pedido"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6 no-scrollbar">
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1 flex gap-0.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
                    <button 
                      onClick={() => handleShareWhatsApp(selectedSale)}
                      className="flex-[2] py-3 bg-emerald-500 text-white rounded-xl font-black uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                      title="Compartilhar no WhatsApp"
                      aria-label="Enviar detalhes do pedido para o WhatsApp do cliente"
                    >
                      <MessageSquare size={14} /> WhatsApp
                    </button>
                    <button 
                      onClick={() => setWhatsappMode(whatsappMode === 'AUTO' ? 'MANUAL' : 'AUTO')}
                      className={`flex-1 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all transition-colors flex items-center justify-center ${whatsappMode === 'AUTO' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 hover:text-indigo-600'}`}
                      title="Alternar Modo WhatsApp"
                      aria-label={`Alternar para modo ${whatsappMode === 'AUTO' ? 'Manual' : 'Automático'}`}
                    >
                      {whatsappMode === 'AUTO' ? 'AUTO' : 'M'}
                    </button>
                  </div>
                  <button 
                    onClick={() => handleCopyMessage(selectedSale)}
                    className="flex-1 py-3 bg-slate-900 dark:bg-indigo-600 text-white rounded-2xl font-black uppercase text-[9px] tracking-widest flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                    title="Copiar Pedido"
                    aria-label="Copiar texto do pedido para a área de transferência"
                  >
                    <Copy size={14} /> Copiar
                  </button>
                </div>

                {selectedSale.items.map((item, idx) => {
                  const product = getProductInfo(item.productId);
                  const variation = getVariationInfo(item.productId, item.variationId);
                  return (
                    <div key={idx} className={`p-4 rounded-3xl border ${isDarkMode ? 'bg-slate-800/50 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-2xl shadow-sm flex items-center justify-center border border-slate-100 dark:border-slate-800">
                          <Tag size={20} className="text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                          <p className={`font-black uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{product?.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{product?.reference}</p>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest">
                        <div className="flex flex-col">
                          <span className={isDarkMode ? 'text-slate-200' : 'text-slate-800'}>{variation?.colorName}</span>
                          <span className="text-slate-400 mt-1">{item.quantity} {item.saleType === SaleType.WHOLESALE ? 'Grades' : 'Pares'}</span>
                        </div>
                        <span className="text-indigo-600 dark:text-indigo-400 text-sm">R$ {(item.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`p-8 border-t ${isDarkMode ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">Subtotal</span>
                <span className="text-lg font-black text-slate-600 dark:text-slate-400">R$ {selectedSale.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              {selectedSale.discount > 0 && (
                <div className="flex justify-between items-center mb-4 text-rose-500">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em]">Desconto</span>
                  <span className="text-lg font-black">- R$ {selectedSale.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-black uppercase tracking-[0.4em] text-slate-900 dark:text-white">Total</span>
                <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">R$ {selectedSale.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentModalSale && (
        <SalePaymentModal
          isOpen={!!paymentModalSale}
          onClose={() => setPaymentModalSale(null)}
          sale={sales.find(s => s.id === paymentModalSale.id) || paymentModalSale}
          accounts={accounts}
          paymentMethods={paymentMethods}
          customer={people.find(p => p.id === paymentModalSale.customerId)}
          isDarkMode={isDarkMode}
          initialMode={paymentModalMode}
          onPay={async (amount, accountId, paymentMethodId, note) => {
            await onPaySale(paymentModalSale.id, amount, accountId, paymentMethodId, note);
          }}
          onUpdatePayment={async (paymentId, amount, accountId, paymentMethodId, note) => {
            await onUpdatePayment(paymentModalSale.id, paymentId, amount, accountId, paymentMethodId, note);
          }}
          onDeletePayment={async (paymentId) => {
            await onDeletePayment(paymentModalSale.id, paymentId);
          }}
        />
      )}

      {editingMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEditingMessage(null)}>
          <div 
            className={`w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 flex items-center justify-between border-b border-slate-50 dark:border-slate-800">
              <div>
                <h2 className={`text-lg font-black uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Editar Mensagem</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">WhatsApp para {editingMessage.sale.customerName || "Cliente"}</p>
              </div>
              <button 
                onClick={() => setEditingMessage(null)} 
                className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-400"
                title="Fechar Edição"
                aria-label="Fechar modal de edição de mensagem"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <textarea 
                className={`w-full h-64 p-4 rounded-2xl text-[12px] font-medium leading-relaxed border-none outline-none focus:ring-4 focus:ring-emerald-500/10 resize-none ${isDarkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-50 text-slate-700'}`}
                value={editingMessage.text}
                onChange={(e) => setEditingMessage({ ...editingMessage, text: e.target.value })}
                placeholder="Escreva sua mensagem aqui..."
                title="Editar Mensagem"
                aria-label="Campo para editar a mensagem do WhatsApp"
              />
              
              <div className="mt-6 flex gap-3">
                <button 
                  onClick={() => setEditingMessage(null)}
                  className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleShareWhatsApp(editingMessage.sale, editingMessage.text)}
                  className="flex-[2] py-4 rounded-2xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <MessageSquare size={16} /> Enviar WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {noteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setNoteModal(null)}>
          <div 
            className={`w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300 ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 flex items-center justify-between border-b border-slate-50 dark:border-slate-800">
               <h2 className={`text-lg font-black uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Observação</h2>
               <button 
                 onClick={() => setNoteModal(null)} 
                 className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-400"
                 title="Fechar Observação"
                 aria-label="Fechar visualização de observação"
               >
                 <X size={20} />
               </button>
            </div>
            <div className="p-6">
               <p className={`text-[12px] font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{noteModal.note}</p>
            </div>
         </div>
       </div>
      )}
    </div>
  );
}
