import { useState, useMemo } from 'react';
import { Sale, SaleType, PaymentStatus, Product, Grid, SaleStatus, Person, PaymentMethod, Account, PaymentTerm } from '../types';
import { ShoppingBag, TrendingUp, User, Calendar, Tag, Filter, Plus, Hash, Clock, CheckCircle2, AlertCircle, MoreVertical, Edit2, Trash2, X, Info, Box, Ban, RotateCcw, Search, MessageSquare, Copy, Share, DollarSign, History, FileText, Lightbulb, FileImage } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sharePDF, shareImage } from '../utils/pdfShare';
import SalePaymentModal from '../components/SalePaymentModal';
import ExportNoteModal from '../components/ExportNoteModal';
import ConfirmDialog from '../components/ConfirmDialog';

interface SalesViewProps {
  sales: Sale[];
  products: Product[];
  grids: Grid[];
  people: Person[];
  paymentMethods: PaymentMethod[];
  accounts: Account[];
  onAdd: () => void;
  onEdit: (sale: Sale) => void;
  onDelete: (id: string, isPermanent?: boolean, skipConfirm?: boolean) => void;
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
  const [yearFilter, setYearFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedStatuses, setSelectedStatuses] = useState<SaleStatus[]>([SaleStatus.SALE, SaleStatus.QUOTE]);
  const [showFilters, setShowFilters] = useState(false);
  const [showOptionsId, setShowOptionsId] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [paymentModalSale, setPaymentModalSale] = useState<Sale | null>(null);
  const [paymentModalMode, setPaymentModalMode] = useState<'PAYMENT' | 'HISTORY'>('PAYMENT');
  const [whatsappMode, setWhatsappMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [editingMessage, setEditingMessage] = useState<{ sale: Sale, text: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    saleId: string | null;
    isPermanent: boolean;
    saleOrderNumber: string;
  }>({ isOpen: false, saleId: null, isPermanent: false, saleOrderNumber: '' });
  const [noteModal, setNoteModal] = useState<{ isOpen: boolean, note: string } | null>(null);
  const [exportModal, setExportModal] = useState<{ isOpen: boolean, type: 'PDF' | 'JPG', sale: Sale | null }>({ isOpen: false, type: 'PDF', sale: null });

  // Mapas para busca rápida O(1)
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach(p => map.set(p.id, p));
    return map;
  }, [products]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    sales.forEach(s => years.add(new Date(s.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [sales]);

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
        const cleanQuery = query.replace(/[()\s-]/g, ''); // Ignora parênteses, espaços e traços
        
        const customer = people.find(p => p.id === s.customerId);
        const nameToSearch = (s.customerName || customer?.name || '').toLowerCase();
        const matchesName = nameToSearch.includes(query);
        
        const cleanOrderNumber = (s.orderNumber || '').toLowerCase().replace(/[()\s-]/g, '');
        const matchesId = cleanOrderNumber.includes(cleanQuery);
        
        // Só busca por telefone se a pesquisa não contiver letras (evita que "T290" busque pelo número 290 no telefone)
        const queryHasLetters = /[a-z]/i.test(query);
        const cleanPhone = (customer?.phone || '').replace(/\D/g, '');
        const matchesPhone = !queryHasLetters && query.replace(/\D/g, '').length > 0 && cleanPhone.includes(query.replace(/\D/g, ''));

        if (!matchesName && !matchesId && !matchesPhone) return false;
      }

      // Filter by Year
      if (yearFilter !== 'ALL') {
        if (new Date(s.date).getFullYear().toString() !== yearFilter) return false;
      }

      return true;
    }).sort((a, b) => b.date - a.date); // Mais recentes primeiro
  }, [sales, filter, paymentFilter, selectedStatuses, searchQuery, yearFilter, people]);

  const totals = useMemo(() => {
    return filteredSales.reduce((acc, sale) => {
      const paid = (sale.paymentHistory || []).reduce((sum, p) => sum + p.amount, 0);
      const remaining = Math.max(0, sale.total - paid);
      acc.totalPaid += paid;
      acc.totalRemaining += remaining;
      return acc;
    }, { totalPaid: 0, totalRemaining: 0 });
  }, [filteredSales]);

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

    const otherItemsText = (sale.otherItems || []).map(item => {
      return `✨ *${item.description || 'Outro Item'}*\n   Sub: R$ ${item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }).join('\n\n');

    const allItemsText = [itemsText, otherItemsText].filter(Boolean).join('\n\n');

    const paymentMethod = paymentMethods.find(pm => pm.id === sale.paymentMethodId);
    const paymentInfo = paymentMethod?.value ? `\n\n💳 *Pagamento: ${paymentMethod.name}*\nchave pix: ${paymentMethod.value}` : `\n\n💳 *Pagamento: ${paymentMethod?.name || 'A definir'}*`;

    const statusText = sale.status === SaleStatus.QUOTE ? 'ORÇAMENTO' : 'PEDIDO';
    const discountText = sale.discount > 0 ? `\n📉 *Desconto:* R$ ${sale.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';

    return `Olá ${customer?.name || sale.customerName || 'Cliente'}!\n\nSeu ${statusText} #${sale.orderNumber}.\n\n*ITENS:*\n${allItemsText}\n\n------------------\n💰 *Subtotal:* R$ ${sale.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${discountText}\n💎 *TOTAL: R$ ${sale.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n------------------\nStatus: ${statusText}${paymentInfo}\n\nAguardamos sua confirmação!`;
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

  const handleExportPDF = async (sale: Sale, observation?: string) => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.width;
      const margin = 20;

      // Cores do Tema (Premium Dark)
      const primaryColor = [15, 23, 42]; // slate-900
      const accentColor = [79, 70, 229]; // indigo-600
      const textColor = [51, 65, 85];    // slate-700
      const lightTextColor = [148, 163, 184]; // slate-400

      // 1. Header Design
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, pageWidth, 45, 'F');
      
      doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.rect(0, 45, pageWidth, 2, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('SISTEMA DE VENDAS', margin, 25);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 200, 200);
      doc.text(sale.status === SaleStatus.QUOTE ? 'ORÇAMENTO' : 'VENDA CONFIRMADA', margin, 32);

      doc.setFontSize(7);
      doc.setTextColor(255, 100, 100);
      doc.text('ESTE DOCUMENTO NÃO TEM VALOR FISCAL', margin, 38);

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`#${sale.orderNumber}`, pageWidth - margin, 28, { align: 'right' });

      // 2. Info Section
      const startY = 65;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, startY, pageWidth - (margin * 2), 25, 2, 2, 'F');

      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('DADOS DO CLIENTE', margin + 5, startY + 8);
      
      doc.setFontSize(11);
      doc.text(sale.customerName || 'Consumidor Final', margin + 5, startY + 18);

      doc.setFontSize(8);
      doc.text('DATA DE EMISSÃO', pageWidth - margin - 35, startY + 8);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(format(sale.date, 'dd/MM/yyyy', { locale: ptBR }), pageWidth - margin - 35, startY + 18);

      // 3. Items Table
      const tableData = sale.items.map(item => {
        const product = products.find(p => p.id === item.productId);
        const variation = product?.variations.find(v => v.id === item.variationId);
        
        let desc = product?.name || 'Produto';
        if (variation?.colorName) desc += ` - ${variation.colorName}`;
        if (item.size) desc += ` (Tam: ${item.size})`;

        return [
          desc,
          item.quantity,
          `R$ ${item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          `R$ ${(item.quantity * item.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        ];
      });

      const otherItemsTableData = (sale.otherItems || []).map(item => [
        item.description || 'Outro Item',
        1,
        `R$ ${item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        `R$ ${item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      ]);

      const allTableData = [...tableData, ...otherItemsTableData];

      autoTable(doc, {
        startY: startY + 35,
        head: [['PRODUTO / DESCRIÇÃO', 'QTD', 'UNITÁRIO', 'TOTAL']],
        body: allTableData,
        theme: 'plain',
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: primaryColor as any,
          fontSize: 9,
          fontStyle: 'bold',
          halign: 'left',
          cellPadding: 4
        },
        bodyStyles: {
          fontSize: 9,
          textColor: textColor as any,
          cellPadding: 4
        },
        columnStyles: {
          1: { halign: 'center', cellWidth: 20 },
          2: { halign: 'right', cellWidth: 35 },
          3: { halign: 'right', cellWidth: 35 }
        },
        margin: { left: margin, right: margin }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 10;

      // 4. Totals Summary
      const summaryX = pageWidth - margin - 60;
      
      doc.setFontSize(9);
      doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);
      doc.text('Valor da Compra:', summaryX, finalY);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(`R$ ${sale.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - margin, finalY, { align: 'right' });

      doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);
      doc.text('Valor de Desconto:', summaryX, finalY + 8);
      doc.setTextColor(225, 29, 72); // rose-600
      const discountText = sale.discountType === 'percentage' ? `${sale.discount}%` : `R$ ${sale.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      doc.text(`- ${discountText}`, pageWidth - margin, finalY + 8, { align: 'right' });

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text('VALOR TOTAL:', summaryX, finalY + 18);
      doc.text(`R$ ${sale.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - margin, finalY + 18, { align: 'right' });

      // 5. Notes / Observation
      let noteY = finalY + 35;
      
      if (observation) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('OBSERVAÇÃO DO DOCUMENTO:', margin, noteY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text(observation, margin, noteY + 7, { maxWidth: pageWidth - (margin * 2) });
        noteY += 25;
      }

      if (sale.notes) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('NOTAS DO PEDIDO:', margin, noteY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text(sale.notes, margin, noteY + 7, { maxWidth: pageWidth - (margin * 2) });
      }

      // Footer Banner
      const footerY = 285;
      doc.setFillColor(241, 245, 249);
      doc.rect(0, footerY - 5, pageWidth, 15, 'F');
      doc.setFontSize(7);
      doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);
      doc.text('Este documento foi gerado eletronicamente através do Sistema de Vendas.', pageWidth / 2, footerY + 2, { align: 'center' });

      const fileName = `${sale.status === SaleStatus.QUOTE ? 'Orcamento' : 'Pedido'}_${sale.orderNumber}.pdf`;
      await sharePDF(doc, fileName);
      setExportModal({ isOpen: false, type: 'PDF', sale: null });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF da venda.');
    }
  };

  const handleExportJPG = async (sale: Sale, observation?: string) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = 1200;
      canvas.height = 1800;

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Header
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, 250);
      ctx.fillStyle = '#4f46e5';
      ctx.fillRect(0, 250, canvas.width, 10);

      // Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 70px Helvetica';
      ctx.fillText('SISTEMA DE VENDAS', 80, 120);
      
      ctx.font = '35px Helvetica';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(sale.status === SaleStatus.QUOTE ? 'ORÇAMENTO' : 'VENDA CONFIRMADA', 80, 180);

      // Sem valor fiscal
      ctx.fillStyle = '#fecaca';
      ctx.font = 'bold 22px Helvetica';
      ctx.fillText('ESTE DOCUMENTO NÃO TEM VALOR FISCAL', 80, 220);

      // Info Section
      ctx.fillStyle = '#f8fafc';
      ctx.roundRect ? (ctx as any).roundRect(80, 290, canvas.width - 160, 160, 20) : ctx.rect(80, 290, canvas.width - 160, 160);
      ctx.fill();

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 25px Helvetica';
      ctx.fillText('CLIENTE', 120, 350);
      ctx.font = '45px Helvetica';
      ctx.fillText(sale.customerName || 'Consumidor Final', 120, 415);

      ctx.textAlign = 'right';
      ctx.font = 'bold 25px Helvetica';
      ctx.fillText('DATA', canvas.width - 120, 350);
      ctx.font = '45px Helvetica';
      ctx.fillText(format(sale.date, 'dd/MM/yyyy'), canvas.width - 120, 415);

      // Table Header
      let currentY = 550;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(80, currentY, canvas.width - 160, 70);
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 30px Helvetica';
      ctx.fillText('PRODUTO / DESCRIÇÃO', 120, currentY + 45);
      ctx.textAlign = 'right';
      ctx.fillText('TOTAL', canvas.width - 120, currentY + 45);

      // Items
      currentY += 120;
      ctx.textAlign = 'left';
      ctx.font = '32px Helvetica';
      ctx.fillStyle = '#334155';

      sale.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        const variation = product?.variations.find(v => v.id === item.variationId);
        let desc = `${item.quantity}x ${product?.name || 'Item'}`;
        if (variation?.colorName) desc += ` - ${variation.colorName}`;
        if (item.size) desc += ` (${item.size})`;

        ctx.fillText(desc, 120, currentY);
        ctx.textAlign = 'right';
        ctx.fillText(`R$ ${(item.quantity * item.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, canvas.width - 120, currentY);
        ctx.textAlign = 'left';
        currentY += 70;
      });

      (sale.otherItems || []).forEach(item => {
        let desc = `${item.description || 'Outro Item'}`;
        ctx.fillText(desc, 120, currentY);
        ctx.textAlign = 'right';
        ctx.fillText(`R$ ${item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, canvas.width - 120, currentY);
        ctx.textAlign = 'left';
        currentY += 70;
      });

      // Totals
      currentY += 40;
      ctx.textAlign = 'right';
      ctx.font = '30px Helvetica';
      ctx.fillStyle = '#64748b';
      ctx.fillText(`Valor da Compra: R$ ${sale.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, canvas.width - 80, currentY);
      
      currentY += 50;
      ctx.fillStyle = '#e11d48';
      const discountText = sale.discountType === 'percentage' ? `${sale.discount}%` : `R$ ${sale.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      ctx.fillText(`Valor de Desconto: - ${discountText}`, canvas.width - 80, currentY);

      currentY += 80;
      ctx.fillStyle = '#4f46e5';
      ctx.font = 'bold 60px Helvetica';
      ctx.fillText(`VALOR TOTAL: R$ ${sale.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, canvas.width - 80, currentY);

      // Observation
      if (observation) {
        currentY += 120;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 25px Helvetica';
        ctx.fillText('OBSERVAÇÃO:', 80, currentY);
        ctx.font = '22px Helvetica';
        ctx.fillStyle = '#475569';
        
        // Wrap text
        const words = observation.split(' ');
        let line = '';
        let obsY = currentY + 40;
        for (let n = 0; n < words.length; n++) {
          let testLine = line + words[n] + ' ';
          let metrics = ctx.measureText(testLine);
          if (metrics.width > canvas.width - 160 && n > 0) {
            ctx.fillText(line, 80, obsY);
            line = words[n] + ' ';
            obsY += 35;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, 80, obsY);
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const fileName = `${sale.status === SaleStatus.QUOTE ? 'Orcamento' : 'Venda'}_${sale.orderNumber}.jpg`;
      await shareImage(dataUrl, fileName);
      setExportModal({ isOpen: false, type: 'JPG', sale: null });
    } catch (error) {
      console.error('Erro ao gerar JPG:', error);
      alert('Erro ao gerar imagem da venda.');
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full pb-44 px-4 overflow-y-auto force-scrollbar pt-4">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <div>
            <h2 className={`text-[13px] font-black uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Vendas</h2>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest leading-none">Relatórios</p>
          </div>

          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${showFilters ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
          >
            <Filter size={18} strokeWidth={2.5} className={!showFilters ? "animate-pulse-blue" : ""} />
          </button>

          <div className="ml-auto flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-0.5">Recebido</span>
              <span className="text-xs font-black text-emerald-500 tabular-nums">R$ {totals.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-0.5">Em Aberto</span>
              <span className="text-xs font-black text-amber-500 tabular-nums">R$ {totals.totalRemaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

            <div className={`flex flex-col gap-2 transition-all duration-300 ${showFilters ? 'h-auto opacity-100' : 'h-0 opacity-0 overflow-hidden'}`}>
              <div className="flex items-center gap-2">
                <div className={`flex p-1 rounded-xl ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
                  {([SaleStatus.SALE, SaleStatus.QUOTE] as const).map(s => (
                    <button 
                      key={s}
                      onClick={() => {
                        setSelectedStatuses(prev => 
                          prev.includes(s) 
                            ? (prev.length > 1 ? prev.filter(x => x !== s) : prev) 
                            : [...prev, s]
                        );
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${selectedStatuses.includes(s) ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
                    >
                      {s === SaleStatus.SALE ? 'Vendas' : 'Orçamentos'}
                    </button>
                  ))}
                </div>

                <div className={`flex p-1 rounded-xl overflow-x-auto force-scrollbar max-w-[200px] ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
                  <button 
                    onClick={() => setYearFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${yearFilter === 'ALL' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
                  >
                    Anos: Todos
                  </button>
                  {availableYears.map(year => (
                    <button 
                      key={year}
                      onClick={() => setYearFilter(year.toString())}
                      className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${yearFilter === year.toString() ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
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

                <div className={`flex p-1 rounded-xl ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
                  {(['ALL', 'PENDING', 'PAID'] as const).map(f => (
                    <button 
                      key={f}
                      onClick={() => setPaymentFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${paymentFilter === f ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
                    >
                      {f === 'ALL' ? 'Pag: Todos' : f === 'PENDING' ? 'Pendente' : 'Pago'}
                    </button>
                  ))}
                </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-2">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Buscar por Nº da Venda ou Nome do Cliente..."
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
                      <div className="flex gap-1 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${sale.status === SaleStatus.QUOTE ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'}`}>
                          {sale.status === SaleStatus.QUOTE ? 'ORÇ.' : 'VENDA'}
                        </span>
                        {status === 'PAID' ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase tracking-widest">
                            QUITADO
                          </span>
                        ) : (
                          <>
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[8px] font-black uppercase tracking-widest">
                              PEND.
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
                    <div className="flex items-center gap-2 mt-1">
                      {sale.sellerName && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[8px] font-black uppercase tracking-widest">
                          {sale.sellerName}
                        </span>
                      )}
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                        #{sale.orderNumber} • {format(sale.date, "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
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
                {(sale.otherItems || []).slice(0, 2).map((item, idx) => (
                  <div key={`other-${idx}`} className="flex items-center justify-between group/item">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={12} className="text-slate-300" />
                      <p className={`text-[10px] font-bold uppercase tracking-tight ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {item.description || 'Outro Item'}
                      </p>
                    </div>
                    <p className={`text-[10px] font-black ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                    </p>
                  </div>
                ))}
                {(sale.items.length + (sale.otherItems?.length || 0)) > 5 && (
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-5">
                    + {(sale.items.length + (sale.otherItems?.length || 0)) - 5} itens
                  </p>
                )}
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-50 dark:border-slate-800">
                <div>
                  {sale.notes && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setNoteModal({ isOpen: true, note: sale.notes || '' });
                      }}
                      className="p-2 bg-yellow-50 dark:bg-yellow-500/10 rounded-xl text-yellow-500 animate-pulse-alert flex items-center justify-center active:scale-95 transition-all"
                      title="Ver Observações"
                      aria-label="Ver observações desta venda"
                    >
                      <Lightbulb size={16} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
                <div className={`flex items-center gap-1.5 p-1.5 rounded-2xl ${isDarkMode ? 'bg-slate-800/80' : 'bg-slate-50 shadow-inner'}`}>
                  <button 
                    onClick={() => setExportModal({ isOpen: true, type: 'PDF', sale })}
                    className="flex items-center justify-center w-9 h-9 rounded-xl text-rose-600 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all active:scale-95 border border-rose-100 dark:border-rose-500/20 text-[9px] font-black"
                  >
                    PDF
                  </button>
                  <button 
                    onClick={() => setExportModal({ isOpen: true, type: 'JPG', sale })}
                    className="flex items-center justify-center w-9 h-9 rounded-xl text-blue-600 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-all active:scale-95 border border-blue-100 dark:border-blue-500/20 text-[9px] font-black"
                  >
                    JPG
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
                      
                      {sale.status === SaleStatus.SALE && (
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
                      )}

                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDialog({ isOpen: true, saleId: sale.id, isPermanent: false, saleOrderNumber: sale.orderNumber });
                          setShowOptionsId(null);
                        }}
                        className="w-full flex items-center gap-2.5 p-3 text-left text-[10px] font-black uppercase text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-xl transition-all"
                      >
                        <RotateCcw size={14} /> Estornar e Cancelar
                      </button>

                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDialog({ isOpen: true, saleId: sale.id, isPermanent: true, saleOrderNumber: sale.orderNumber });
                          setShowOptionsId(null);
                        }}
                        className="w-full flex items-center gap-2.5 p-3 text-left text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all font-bold"
                      >
                        <Trash2 size={14} /> Estornar e Excluir
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {sale.status === SaleStatus.QUOTE && (
                <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onConvert(sale.id);
                    }}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] animate-in fade-in zoom-in-95 duration-300"
                  >
                    <CheckCircle2 size={18} strokeWidth={3} />
                    Confirmar como Venda
                  </button>
                </div>
              )}
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

      {exportModal.isOpen && exportModal.sale && (
        <ExportNoteModal
          isOpen={exportModal.isOpen}
          type={exportModal.type}
          isDarkMode={isDarkMode}
          onClose={() => setExportModal({ ...exportModal, isOpen: false })}
          onConfirm={(obs, type) => {
            if (type === 'PDF') handleExportPDF(exportModal.sale!, obs);
            else handleExportJPG(exportModal.sale!, obs);
          }}
        />
      )}

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

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.isPermanent ? "Excluir Venda" : "Cancelar Venda"}
        message={confirmDialog.isPermanent 
          ? `ATENÇÃO: Você está prestes a EXCLUIR PERMANENTEMENTE a venda #${confirmDialog.saleOrderNumber}.\n\nIsso irá:\n1. Estornar os estoques dos produtos.\n2. Estornar os saldos das contas (financeiro).\n3. Remover as transações relacionadas.\n4. Apagar o registro definitivamente.\n\nDeseja continuar?`
          : `Deseja estornar e cancelar a venda #${confirmDialog.saleOrderNumber}?\n\nIsso irá estornar estoques e financeiro, mas manterá o registro como CANCELADO.`}
        confirmLabel={confirmDialog.isPermanent ? "Sim, Excluir" : "Sim, Cancelar"}
        cancelLabel="Voltar"
        onConfirm={() => {
          if (confirmDialog.saleId) {
            onDelete(confirmDialog.saleId, confirmDialog.isPermanent, true);
          }
          setConfirmDialog({ isOpen: false, saleId: null, isPermanent: false, saleOrderNumber: '' });
        }}
        onCancel={() => setConfirmDialog({ isOpen: false, saleId: null, isPermanent: false, saleOrderNumber: '' })}
        isDanger={true}
      />
    </div>
  );
}
