import React, { useState, useMemo } from 'react';
import { Download, ArrowLeft, Calendar, Filter, Copy, Check, MessageCircle, FileText, Hash, Share2 } from 'lucide-react';
import { sharePDF } from '../utils/pdfShare';
import { Sale, Transaction, Product, Person, SaleStatus, TransactionType, Category } from '../types';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ComboBox from '../components/ComboBox';

const PDF_COLORS = {
  PRIMARY: [63, 81, 181] as [number, number, number],
  SECONDARY: [100, 116, 139] as [number, number, number],
  SUCCESS: [16, 185, 129] as [number, number, number],
  DANGER: [239, 68, 68] as [number, number, number],
};

interface ReportDetailedViewProps {
  isDarkMode: boolean;
  onBack: () => void;
  reportId: string;
  sales: Sale[];
  purchases: any[];
  transactions: Transaction[];
  products: Product[];
  people: Person[];
  categories: Category[];
}

export default function ReportDetailedView({
  isDarkMode,
  onBack,
  reportId,
  sales,
  purchases,
  transactions,
  products,
  people,
  categories,
}: ReportDetailedViewProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [accountingFilter, setAccountingFilter] = useState<'ALL' | 'ACCOUNTING' | 'NON_ACCOUNTING'>('ALL');
  const [modelSearch, setModelSearch] = useState('');
  
  const suppliers = useMemo(() => people.filter(p => p.isSupplier), [people]);
  const customers = useMemo(() => people.filter(p => p.isCustomer), [people]);

  const peopleMap = useMemo(() => {
    const map = new Map<string, Person>();
    people.forEach(p => map.set(p.id, p));
    return map;
  }, [people]);

  const productsMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach(p => map.set(p.id, p));
    return map;
  }, [products]);

  const categoriesMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach(c => map.set(c.id, c));
    return map;
  }, [categories]);

  const PDF_COLORS = {
    PRIMARY: [30, 41, 59],
    SECONDARY: [71, 85, 105],
    ACCENT: [79, 70, 229],
    DANGER: [244, 63, 94],
    SUCCESS: [16, 185, 129],
    HEADER_BG: [241, 245, 249],
    ROW_ALT: [250, 250, 250],
  };
  
  const [customerRelSearchId, setCustomerRelSearchId] = useState('');
  const [messageFormat, setMessageFormat] = useState<'RESUMO' | 'COMPLETO'>('RESUMO');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [isConsolidatedModalOpen, setIsConsolidatedModalOpen] = useState(false);
  const [selectedConsolidatedIds, setSelectedConsolidatedIds] = useState<Set<string>>(new Set());

  const filterByDateRange = (dateNum: number) => {
    if (!startDate && !endDate) return true;
    const date = new Date(dateNum);
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date(8640000000000000);
    end.setHours(23, 59, 59, 999);
    return isWithinInterval(date, { start, end });
  };

  const reportTitle = useMemo(() => {
    switch (reportId) {
      case 'ventas-periodo': return 'Vendas por Período';
      case 'clientes-mais-compram': return 'Clientes que mais compram';
      case 'produtos-curva-a': return 'Produtos Curva A';
      case 'desempenho-financeiro': return 'Desempenho Financeiro';
      case 'dividas-fornecedor': return 'Dívidas por Fornecedor';
      case 'informacao-estoque': return 'Informação de Estoques';
      case 'relacionamento-cliente': return 'Relacionamento com Cliente';
      default: return 'Relatório';
    }
  }, [reportId]);

  // Vendas por periodo logic
  const salesByPeriodData = useMemo(() => {
    if (reportId !== 'ventas-periodo') return [];
    const filtered = sales.filter(s => 
        s.status === SaleStatus.SALE && 
        filterByDateRange(s.date) &&
        (customerSearch === '' || (s.customerName || '').toLowerCase().includes(customerSearch.toLowerCase()))
    );
    
    const byMonth: Record<string, { total: number, count: number, pending: number }> = {};
    filtered.forEach(s => {
      const monthYear = format(s.date, 'MM/yyyy');
      if (!byMonth[monthYear]) byMonth[monthYear] = { total: 0, count: 0, pending: 0 };
      byMonth[monthYear].total += s.total;
      byMonth[monthYear].count += 1;
      const totalPaid = (s.paymentHistory || []).reduce((acc, p) => acc + p.amount, 0);
      if (totalPaid < s.total) {
        byMonth[monthYear].pending += (s.total - totalPaid);
      }
    });

    return Object.entries(byMonth).map(([period, data]) => ({
      period,
      ...data
    })).sort((a, b) => b.period.localeCompare(a.period));
  }, [sales, reportId, startDate, endDate, customerSearch]);

  // Dívidas por fornecedor logic (Relacionamento Fornecedor)
  const dividasFornecedorData = useMemo(() => {
    if (reportId !== 'dividas-fornecedor') return [];
    
    const filteredPurchases = purchases.filter(p => 
        (supplierId === '' || p.supplierId === supplierId) &&
        (accountingFilter === 'ALL' || (accountingFilter === 'ACCOUNTING' ? p.generateTransaction === true : p.generateTransaction !== true)) &&
        filterByDateRange(p.date)
    ).map(p => {
        const totalPaid = (p.paymentHistory || []).reduce((acc: number, pay: any) => acc + pay.amount, 0);
        const pending = Math.max(0, p.total - totalPaid);
        return {
            ...p,
            orderNumber: p.batchNumber || p.id,
            isManual: false,
            pending,
            supplierObj: peopleMap.get(p.supplierId)
        }
    });

    const filteredTransactions = transactions.filter(t => 
        t.type === TransactionType.EXPENSE &&
        !t.relatedId && 
        filterByDateRange(t.date) &&
        (supplierId === '' || t.contactId === supplierId)
    ).map(t => {
        const pending = t.status === 'PENDING' ? t.amount : 0;
        return {
            id: t.id,
            date: t.date,
            orderNumber: t.transactionNumber || 'Manual',
            description: t.description,
            supplierId: t.contactId,
            supplierName: t.contactName,
            total: t.amount,
            items: t.items || [],
            isManual: true,
            pending,
            supplierObj: peopleMap.get(t.contactId)
        }
    });
    
    return [...filteredPurchases, ...filteredTransactions].sort((a, b) => b.date - a.date);
  }, [purchases, transactions, reportId, startDate, endDate, supplierId, peopleMap, accountingFilter]);

  // Clientes que mais compram logic
  const topCustomersData = useMemo(() => {
    if (reportId !== 'clientes-mais-compram') return [];
    const filtered = sales.filter(s => s.status === SaleStatus.SALE && filterByDateRange(s.date));
    
    const byCustomer: Record<string, { id: string, name: string, total: number, count: number }> = {};
    filtered.forEach(s => {
      const cid = s.customerId || 'unknown';
      if (!byCustomer[cid]) {
        byCustomer[cid] = { 
          id: cid, 
          name: s.customerName || (cid !== 'unknown' ? peopleMap.get(cid)?.name || 'Desconhecido' : 'Avulso'),
          total: 0, 
          count: 0 
        };
      }
      byCustomer[cid].total += s.total;
      byCustomer[cid].count += 1;
    });

    return Object.values(byCustomer).sort((a, b) => b.total - a.total);
  }, [sales, peopleMap, reportId, startDate, endDate]);

  // Produtos Curva A
  const curvaAData = useMemo(() => {
    if (reportId !== 'produtos-curva-a') return [];
    const filtered = sales.filter(s => s.status === SaleStatus.SALE && filterByDateRange(s.date));
    
    const byProduct: Record<string, { id: string, name: string, colorName: string, categoryName: string, quantity: number, total: number }> = {};
    filtered.forEach(s => {
      s.items.forEach(item => {
        const prod = productsMap.get(item.productId);
        const variation = prod?.variations.find(v => v.id === item.variationId);
        const categoryName = prod?.categoryId ? categoriesMap.get(prod.categoryId)?.name || 'Sem Categoria' : 'Sem Categoria';
        const key = `${item.productId}-${item.variationId}`;
        if (!byProduct[key]) {
          byProduct[key] = {
            id: key,
            name: prod?.name || '?',
            colorName: variation?.colorName || '?',
            categoryName: categoryName,
            quantity: 0,
            total: 0
          };
        }
        byProduct[key].quantity += item.quantity;
        byProduct[key].total += (item.quantity * item.price);
      });
    });

    let list = Object.values(byProduct).sort((a, b) => b.total - a.total);
    const overallTotal = list.reduce((acc, p) => acc + p.total, 0);
    
    let cumulated = 0;
    return list.map(item => {
      cumulated += item.total;
      const pct = overallTotal > 0 ? (cumulated / overallTotal) * 100 : 0;
      let classification = 'C';
      if (pct <= 80) classification = 'A';
      else if (pct <= 95) classification = 'B';
      
      return {
        ...item,
        pct: (item.total / overallTotal) * 100,
        cumulatedPct: pct,
        classification
      };
    });
  }, [sales, productsMap, reportId, startDate, endDate, categoriesMap]);

  // Desempenho Financeiro
  const financialData = useMemo(() => {
    if (reportId !== 'desempenho-financeiro') return [];
    
    const filtered = transactions.filter(t => filterByDateRange(t.date));
    const byMonth: Record<string, { income: number, expense: number }> = {};
    
    filtered.forEach(t => {
      const monthYear = format(t.date, 'MM/yyyy');
      if (!byMonth[monthYear]) byMonth[monthYear] = { income: 0, expense: 0 };
      if (t.type === TransactionType.INCOME) byMonth[monthYear].income += t.amount;
      if (t.type === TransactionType.EXPENSE) byMonth[monthYear].expense += t.amount;
    });

    return Object.entries(byMonth).map(([period, data]) => ({
      period,
      ...data,
      balance: data.income - data.expense
    })).sort((a, b) => b.period.localeCompare(a.period));
  }, [transactions, reportId, startDate, endDate]);


  // Informação de Estoques
  const stockInfoData = useMemo(() => {
    if (reportId !== 'informacao-estoque') return [];
    
    const data: any[] = [];
    products.forEach(p => {
        if (modelSearch && !p.reference.toLowerCase().includes(modelSearch.toLowerCase())) return;
        p.variations.forEach(v => {
            const totalStock = Object.values(v.stock).reduce((acc, qty) => acc + qty, 0);
            if (totalStock > 0) {
              data.push({
                  reference: p.reference,
                  color: v.colorName,
                  quantity: totalStock,
                  costPrice: p.costPrice,
                  salePrice: p.salePrice,
                  totalCost: totalStock * p.costPrice,
                  totalSale: totalStock * p.salePrice
              });
            }
        });
    });
    return data;
  }, [products, reportId, modelSearch]);

  const stockInfoTotals = useMemo(() => {
    if (reportId !== 'informacao-estoque') return { cost: 0, sale: 0 };
    return stockInfoData.reduce((acc, item) => {
        acc.cost += item.totalCost;
        acc.sale += item.totalSale;
        return acc;
    }, { cost: 0, sale: 0 });
  }, [stockInfoData, reportId]);

  // Relacionamento com Cliente logic
  const relacionamentoClienteData = useMemo(() => {
    if (reportId !== 'relacionamento-cliente') return [];
    
    const filteredSales = sales.filter(s => 
        s.status === SaleStatus.SALE && 
        filterByDateRange(s.date) &&
        (customerRelSearchId === '' || s.customerId === customerRelSearchId)
    ).map(s => {
        const totalPaid = (s.paymentHistory || []).reduce((acc, p) => acc + p.amount, 0);
        const pending = Math.max(0, s.total - totalPaid);
        return {
            ...s,
            isManual: false,
            pending,
            customerObj: peopleMap.get(s.customerId)
        }
    });

    const filteredTransactions = transactions.filter(t => 
        t.type === TransactionType.INCOME &&
        !t.relatedId && // Apenas manuais (sem vinculo com venda)
        filterByDateRange(t.date) &&
        (customerRelSearchId === '' || t.contactId === customerRelSearchId)
    ).map(t => {
        const pending = t.status === 'PENDING' ? t.amount : 0;
        return {
            id: t.id,
            date: t.date,
            orderNumber: t.transactionNumber || 'Manual',
            description: t.description,
            customerId: t.contactId,
            customerName: t.contactName,
            total: t.amount,
            items: t.items || [],
            isManual: true,
            pending,
            customerObj: peopleMap.get(t.contactId)
        }
    });
    
    return [...filteredSales, ...filteredTransactions].sort((a, b) => b.date - a.date);
  }, [sales, transactions, reportId, startDate, endDate, customerRelSearchId, peopleMap]);

  const getWhatsAppLink = (phone: string, message: string) => {
    let clean = phone.replace(/\D/g, '');
    if (!clean) return null;
    if (!clean.startsWith('55') && (clean.length === 10 || clean.length === 11)) {
        clean = '55' + clean;
    }
    return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
  };

  const generateClientMessage = (item: any) => {
    const customerName = item.customerObj?.name || item.customerName || 'Cliente';
    const dateStr = format(new Date(item.date), 'dd/MM/yyyy');
    const totalStr = `R$ ${item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const pendingStr = `R$ ${item.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    if (item.isManual) {
        const docId = item.orderNumber !== 'Manual' ? `ID #${item.orderNumber}` : '';
        return `Olá ${customerName}, referente ao lançamento "${item.description}" ${docId} de ${dateStr}.\nO valor total foi de ${totalStr}.\nAtualmente, há um saldo em aberto de ${pendingStr}.\nQualquer dúvida, estamos à disposição!`;
    }

    if (messageFormat === 'RESUMO') {
        return `Olá ${customerName}, referente ao seu pedido #${item.orderNumber} de ${dateStr}.\nO valor total foi de ${totalStr}.\nAtualmente, há um saldo em aberto de ${pendingStr}.\nQualquer dúvida, estamos à disposição!`;
    } else {
        let itemsStr = item.items.map((i: any) => {
            const p = productsMap.get(i.productId);
            return `- ${i.quantity}x ${p?.name || 'Produto'} (R$ ${i.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`;
        }).join('\n');
        
        return `Olá ${customerName}, segue o resumo do seu pedido #${item.orderNumber} feito em ${dateStr}:\n\nITENS:\n${itemsStr}\n\nTotal do Pedido: ${totalStr}\nSaldo em Aberto: ${pendingStr}\n\nQualquer dúvida, estamos à disposição!`;
    }
  };

  const generateSupplierMessage = (item: any) => {
    const supplierName = item.supplierObj?.name || item.supplierName || 'Fornecedor';
    const dateStr = format(new Date(item.date), 'dd/MM/yyyy');
    const totalStr = `R$ ${item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const pendingStr = `R$ ${item.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    if (item.isManual) {
        const docId = item.orderNumber !== 'Manual' ? `ID #${item.orderNumber}` : '';
        return `Olá ${supplierName}, referente ao lançamento "${item.description}" ${docId} de ${dateStr}.\nO valor total foi de ${totalStr}.\nAtualmente, há um saldo pendente de ${pendingStr}.\nQualquer dúvida, estou à disposição!`;
    }

    if (messageFormat === 'RESUMO') {
        return `Olá ${supplierName}, referente à compra #${item.orderNumber} de ${dateStr}.\nO valor total foi de ${totalStr}.\nAtualmente, há um saldo pendente de ${pendingStr}.\nQualquer dúvida, estou à disposição!`;
    } else {
        let itemsStr = item.items.map((i: any) => {
            const p = productsMap.get(i.productId);
            return `- ${i.quantity}x ${p?.name || 'Produto'} (R$ ${i.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`;
        }).join('\n');
        
        return `Olá ${supplierName}, segue o resumo da compra #${item.orderNumber} feita em ${dateStr}:\n\nITENS:\n${itemsStr}\n\nTotal da Compra: ${totalStr}\nSaldo Pendente: ${pendingStr}\n\nQualquer dúvida, estou à disposição!`;
    }
  };

  const handleCopyMessage = (item: any) => {
    const msg = reportId === 'dividas-fornecedor' ? generateSupplierMessage(item) : generateClientMessage(item);
    navigator.clipboard.writeText(msg);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleWhatsApp = (item: any) => {
    const msg = reportId === 'dividas-fornecedor' ? generateSupplierMessage(item) : generateClientMessage(item);
    const phone = (reportId === 'dividas-fornecedor' ? item.supplierObj?.phone : item.customerObj?.phone) || '';
    const link = getWhatsAppLink(phone, msg);
    
    if (link) {
        window.open(link, '_blank');
    } else {
        alert("Contato não possui telefone válido cadastrado. O texto será copiado.");
        handleCopyMessage(item);
    }
  };

  const openConsolidatedModal = () => {
      const data = reportId === 'dividas-fornecedor' ? dividasFornecedorData : relacionamentoClienteData;
      setSelectedConsolidatedIds(new Set(data.map(r => r.id)));
      setIsConsolidatedModalOpen(true);
  };

  const generateConsolidatedMessage = () => {
      const reportData = reportId === 'dividas-fornecedor' ? dividasFornecedorData : relacionamentoClienteData;
      const selectedItems = reportData.filter(r => selectedConsolidatedIds.has(r.id));
      if (selectedItems.length === 0) return "Nenhum item selecionado.";
      
      const isSupplier = reportId === 'dividas-fornecedor';
      const contactName = isSupplier 
        ? (selectedItems[0]?.supplierObj?.name || selectedItems[0]?.supplierName || 'Fornecedor')
        : (selectedItems[0]?.customerObj?.name || selectedItems[0]?.customerName || 'Cliente');
      
      let totalTotal = 0;
      let totalPending = 0;
      let contentStr = '';
      
      selectedItems.forEach(item => {
          const dateStr = format(new Date(item.date), 'dd/MM/yyyy');
          const itemTotalStr = `R$ ${item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
          const itemPendingStr = `R$ ${item.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
          
          totalTotal += item.total;
          totalPending += item.pending;
          
          if (item.isManual) {
              contentStr += `\n- Lançamento: ${item.description} (${dateStr})\n  Total: ${itemTotalStr} | Pendente: ${itemPendingStr}\n`;
          } else {
              if (messageFormat === 'RESUMO') {
                  contentStr += `\n- ${isSupplier ? 'Compra' : 'Pedido'} #${item.orderNumber} (${dateStr})\n  Total: ${itemTotalStr} | Pendente: ${itemPendingStr}\n`;
              } else {
                  contentStr += `\n- ${isSupplier ? 'Compra' : 'Pedido'} #${item.orderNumber} (${dateStr})\n  Total: ${itemTotalStr} | Pendente: ${itemPendingStr}\n`;
                  item.items.forEach((i: any) => {
                      const p = productsMap.get(i.productId);
                      const priceOrCost = isSupplier ? i.cost : i.price;
                      contentStr += `    * ${i.quantity}x ${p?.name || 'Produto'} (R$ ${priceOrCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})\n`;
                  });
              }
          }
      });
      
      const finalTotalStr = `R$ ${totalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      const finalPendingStr = `R$ ${totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      
      return `Olá ${contactName}, segue o extrato consolidado:\n${contentStr}\n\nTotal Geral: ${finalTotalStr}\nSaldo Total ${isSupplier ? 'Pendente' : 'em Aberto'}: ${finalPendingStr}\n\nQualquer dúvida, estou à disposição!`;
  };

  const handleCopyConsolidated = () => {
      const msg = generateConsolidatedMessage();
      navigator.clipboard.writeText(msg);
      alert('Mensagem consolidada copiada!');
  };

  const handleWhatsAppConsolidated = () => {
      const msg = generateConsolidatedMessage();
      const reportData = reportId === 'dividas-fornecedor' ? dividasFornecedorData : relacionamentoClienteData;
      const selectedItems = reportData.filter(r => selectedConsolidatedIds.has(r.id));
      const phone = (reportId === 'dividas-fornecedor' ? selectedItems[0]?.supplierObj?.phone : selectedItems[0]?.customerObj?.phone) || '';
      const link = getWhatsAppLink(phone, msg);
      
      if (link) {
          window.open(link, '_blank');
      } else {
          alert("Contato não possui telefone válido cadastrado. O texto será copiado.");
          handleCopyConsolidated();
      }
  };

  const exportConsolidatedPDF = async () => {
    try {
      const isSupplier = reportId === 'dividas-fornecedor';
      const reportData = isSupplier ? dividasFornecedorData : relacionamentoClienteData;
      const selectedItems = reportData.filter(r => selectedConsolidatedIds.has(r.id));
      if (selectedItems.length === 0) return;
      
      const contactName = isSupplier 
        ? (selectedItems[0]?.supplierObj?.name || selectedItems[0]?.supplierName || 'Fornecedor')
        : (selectedItems[0]?.customerObj?.name || selectedItems[0]?.customerName || 'Cliente');
      
      // Use standard configuration for jsPDF
      const doc = new jsPDF('p', 'mm', 'a4');
      
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      let currentY = 0;

      // Helper for safer text width
      const getSafeWidth = (txt: string) => {
        try {
          return doc.getTextWidth(txt);
        } catch (e) {
          return txt.length * 2; // Rough estimate if function fails
        }
      };

      // --- Modern Header ---
      doc.setFillColor(PDF_COLORS.PRIMARY[0], PDF_COLORS.PRIMARY[1], PDF_COLORS.PRIMARY[2]);
      doc.rect(0, 0, pageWidth, 45, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('EXTRATO CONSOLIDADO', 14, 20);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`${isSupplier ? 'FORNECEDOR' : 'CLIENTE'}: ${contactName.toUpperCase()}`, 14, 30);
      
      const dateStrNow = format(new Date(), 'dd/MM/yyyy HH:mm');
      doc.text(`EMISSÃO: ${dateStrNow}`, 14, 36);
      doc.text(`FORMATO: ${messageFormat === 'RESUMO' ? 'RESUMO DE TOTAIS' : 'HISTÓRICO COMPLETO (ITENS)'}`, 14, 42);

      // --- Totals Calculation ---
      let totalTotal = 0;
      let totalPending = 0;
      selectedItems.forEach(item => {
          totalTotal += (item.total || 0);
          totalPending += (item.pending || 0);
      });

      currentY = 55;
      doc.setTextColor(PDF_COLORS.PRIMARY[0], PDF_COLORS.PRIMARY[1], PDF_COLORS.PRIMARY[2]);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO FINANCEIRO', 14, currentY);
      
      currentY += 5;
      // Total Card
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, currentY, (pageWidth - 34) / 2, 22, 3, 3, 'FD');
      doc.setTextColor(PDF_COLORS.SECONDARY[0], PDF_COLORS.SECONDARY[1], PDF_COLORS.SECONDARY[2]);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL EM COMPRAS', 18, currentY + 8);
      doc.setTextColor(PDF_COLORS.PRIMARY[0], PDF_COLORS.PRIMARY[1], PDF_COLORS.PRIMARY[2]);
      doc.setFontSize(14);
      doc.text(`R$ ${totalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 18, currentY + 16);

      // Pending Card
      doc.setFillColor(255, 241, 242);
      doc.setDrawColor(254, 202, 202);
      doc.roundedRect(pageWidth / 2 + 3, currentY, (pageWidth - 34) / 2, 22, 3, 3, 'FD');
      doc.setTextColor(153, 27, 27);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('SALDO EM ABERTO', pageWidth / 2 + 7, currentY + 8);
      doc.setFontSize(14);
      doc.text(`R$ ${totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth / 2 + 7, currentY + 16);

      currentY += 35;

      if (messageFormat === 'RESUMO') {
          doc.setTextColor(PDF_COLORS.PRIMARY[0], PDF_COLORS.PRIMARY[1], PDF_COLORS.PRIMARY[2]);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(isSupplier ? 'LANÇAMENTOS / COMPRAS' : 'LANÇAMENTOS / VENDAS', 14, currentY - 5);

          const head = [['DATA', 'DOCUMENTO', 'DESCRIÇÃO', 'TOTAL', 'PENDENTE']];
          const body = selectedItems.map(item => [
              format(new Date(item.date), 'dd/MM/yyyy'),
              item.isManual ? (item.orderNumber !== 'Manual' ? `#${item.orderNumber}` : 'MANUAL') : `#${item.orderNumber}`,
              (item.isManual ? (item.description || 'Lançamento Manual') : (isSupplier ? 'COMPRA DE PRODUTOS' : 'VENDA DE PRODUTOS')).toUpperCase(),
              `R$ ${(item.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
              `R$ ${(item.pending || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          ]);

          autoTable(doc, { 
              startY: currentY, 
              head, 
              body, 
              theme: 'striped',
              headStyles: { fillColor: PDF_COLORS.PRIMARY as any, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
              bodyStyles: { textColor: PDF_COLORS.PRIMARY as any, fontSize: 8 },
              alternateRowStyles: { fillColor: [250, 250, 250] },
              margin: { left: 14, right: 14 }
          });
          currentY = (doc as any).lastAutoTable.finalY + 10;
      } else {
          doc.setTextColor(PDF_COLORS.PRIMARY[0], PDF_COLORS.PRIMARY[1], PDF_COLORS.PRIMARY[2]);
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(isSupplier ? 'DETALHAMENTO POR COMPRA' : 'DETALHAMENTO POR PEDIDO', 14, currentY - 5);

          for (const item of selectedItems) {
              const itemDate = new Date(item.date);
              const dateStr = format(itemDate, 'dd/MM/yyyy');
              const docLabel = item.isManual ? (item.orderNumber !== 'Manual' ? `ID #${item.orderNumber}` : 'LANC. MANUAL') : (isSupplier ? `COMPRA #${item.orderNumber}` : `PEDIDO #${item.orderNumber}`);
              
              // Ensure we have space for the header at least
              if (currentY > pageHeight - 40) {
                  doc.addPage();
                  currentY = 20;
              }

              // Order Header Box
              doc.setFillColor(241, 245, 249);
              doc.rect(14, currentY, pageWidth - 28, 10, 'F');
              doc.setTextColor(PDF_COLORS.PRIMARY[0], PDF_COLORS.PRIMARY[1], PDF_COLORS.PRIMARY[2]);
              doc.setFontSize(9);
              doc.setFont('helvetica', 'bold');
              doc.text(`${dateStr} - ${docLabel}`, 18, currentY + 6.5);
              
              // Use explicit right alignment to prevent overlap
              const totalText = `TOTAL: R$ ${(item.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
              doc.text(totalText, pageWidth - 60, currentY + 6.5, { align: 'right' });
              
              const pendingText = `PENDENTE: R$ ${(item.pending || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
              if ((item.pending || 0) > 0) {
                doc.setTextColor(153, 27, 27);
              } else {
                doc.setTextColor(PDF_COLORS.SUCCESS[0], PDF_COLORS.SUCCESS[1], PDF_COLORS.SUCCESS[2]);
              }
              doc.text(pendingText, pageWidth - 18, currentY + 6.5, { align: 'right' });
              
              currentY += 10;

              if (item.isManual) {
                  doc.setTextColor(PDF_COLORS.SECONDARY[0], PDF_COLORS.SECONDARY[1], PDF_COLORS.SECONDARY[2]);
                  doc.setFontSize(8);
                  doc.setFont('helvetica', 'normal');
                  doc.text(`Descrição: ${item.description || 'Sem descrição'}`, 18, currentY + 6);
                  currentY += 10;

                  if (item.items && item.items.length > 0) {
                      const manualBody = item.items.map((mi: any) => [
                          mi?.description || 'Item',
                          `R$ ${(mi?.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      ]);

                      autoTable(doc, {
                          startY: currentY,
                          head: [['DESCRIÇÃO DO ITEM', 'VALOR']],
                          body: manualBody,
                          theme: 'plain',
                          headStyles: { fillColor: [255, 255, 255], textColor: [PDF_COLORS.SECONDARY[0], PDF_COLORS.SECONDARY[1], PDF_COLORS.SECONDARY[2]], fontStyle: 'bold', fontSize: 7, cellPadding: 2 },
                          bodyStyles: { textColor: [PDF_COLORS.PRIMARY[0], PDF_COLORS.PRIMARY[1], PDF_COLORS.PRIMARY[2]], fontSize: 7, cellPadding: 2 },
                          margin: { left: 18, right: 18 },
                      });
                      currentY = (doc as any).lastAutoTable.finalY + 5;
                  }
              } else {
                  const itemBody = (item.items || []).map((i: any) => {
                      const p = productsMap.get(i?.productId);
                      const varObj = p?.variations.find(v => v.id === i?.variationId);
                      const prodName = p ? `${p.name} (${varObj?.colorName || ''})` : 'PRODUTO NÃO ENCONTRADO';
                      return [
                          prodName,
                          (i?.quantity || 0).toString(),
                          `R$ ${(isSupplier ? (i?.cost || 0) : (i?.price || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                          `R$ ${((i?.quantity || 0) * (isSupplier ? (i?.cost || 0) : (i?.price || 0))).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      ];
                  });

                  autoTable(doc, {
                      startY: currentY,
                      head: [['PRODUTO', 'QTD', 'UNITÁRIO', 'SUBTOTAL']],
                      body: itemBody,
                      theme: 'plain',
                      headStyles: { fillColor: [255, 255, 255], textColor: [PDF_COLORS.SECONDARY[0], PDF_COLORS.SECONDARY[1], PDF_COLORS.SECONDARY[2]], fontStyle: 'bold', fontSize: 7, cellPadding: 2 },
                      bodyStyles: { textColor: [PDF_COLORS.PRIMARY[0], PDF_COLORS.PRIMARY[1], PDF_COLORS.PRIMARY[2]], fontSize: 7, cellPadding: 2 },
                      margin: { left: 18, right: 18 },
                  });
                  currentY = (doc as any).lastAutoTable.finalY + 5;

                  // List payments if it's a sale with history
                  if (!item.isManual && (item as any).paymentHistory && (item as any).paymentHistory.length > 0) {
                      const payments = (item as any).paymentHistory;
                      const paymentBody = payments.map((p: any) => [
                          format(new Date(p.date), 'dd/MM/yyyy'),
                          `R$ ${(p.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                          p.note || (isSupplier ? 'Pagamento' : 'Recebimento')
                      ]);

                      autoTable(doc, {
                          startY: currentY,
                          head: [[isSupplier ? 'DATA PAGTO' : 'DATA RECEBTO', isSupplier ? 'VALOR PAGO' : 'VALOR RECEBIDO', 'OBSERVAÇÃO']],
                          body: paymentBody,
                          theme: 'plain',
                          headStyles: { fillColor: isSupplier ? [241, 245, 249] : [255, 241, 242], textColor: isSupplier ? PDF_COLORS.PRIMARY as any : [153, 27, 27], fontStyle: 'bold', fontSize: 7, cellPadding: 2 },
                          bodyStyles: { textColor: isSupplier ? PDF_COLORS.PRIMARY as any : [153, 27, 27], fontSize: 7, cellPadding: 2 },
                          margin: { left: 18, right: 18 },
                      });
                      currentY = (doc as any).lastAutoTable.finalY + 5;
                  }
              }
              currentY += 5;
          }
      }

      // Final Footer Summary
      if (currentY > pageHeight - 40) {
          doc.addPage();
          currentY = 20;
      }
      
      doc.setDrawColor(PDF_COLORS.PRIMARY[0], PDF_COLORS.PRIMARY[1], PDF_COLORS.PRIMARY[2]);
      doc.setLineWidth(0.5);
      doc.line(14, currentY, pageWidth - 14, currentY);
      
      doc.setTextColor(PDF_COLORS.PRIMARY[0], PDF_COLORS.PRIMARY[1], PDF_COLORS.PRIMARY[2]);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO FINAL DO EXTRATO', 14, currentY + 8);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Acumulado: R$ ${totalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, currentY + 14);
      
      doc.setTextColor(153, 27, 27);
      doc.setFont('helvetica', 'bold');
      doc.text(`Saldo Total devedor: R$ ${totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, currentY + 20);

      // Sanitize filename for Android
      const safeFileName = `Extrato_${contactName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      await sharePDF(doc, safeFileName);
    } catch (error: any) {
      console.error('Error generating consolidated PDF:', error);
      alert(`Erro ao gerar PDF Consolidado: ${error.message || 'Dados inválidos ou erro de memória'}`);
    }
  };

  const exportPDF = async () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(reportTitle, 14, 22);
    
    let subTitle = 'Período: ';
    if (startDate && endDate) subTitle += `${format(new Date(startDate), 'dd/MM/yyyy')} a ${format(new Date(endDate), 'dd/MM/yyyy')}`;
    else if (startDate) subTitle += `A partir de ${format(new Date(startDate), 'dd/MM/yyyy')}`;
    else if (endDate) subTitle += `Até ${format(new Date(endDate), 'dd/MM/yyyy')}`;
    else subTitle += 'Todos os períodos';
    
    doc.setFontSize(10);
    doc.text(subTitle, 14, 30);

    doc.setFontSize(8);
    const dateStr = format(new Date(), 'dd/MM/yyyy HH:mm');
    doc.text(`Gerado em: ${dateStr}`, 14, 35);

    if (reportId === 'ventas-periodo') {
      const head = [['Período', 'Vendas', 'Total', 'Pendente']];
      const body = salesByPeriodData.map(r => [
        r.period,
        r.count.toString(),
        `R$ ${r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `R$ ${r.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      ]);
      autoTable(doc, { startY: 40, head, body, theme: 'grid' });
    } else if (reportId === 'clientes-mais-compram') {
      const head = [['#', 'Cliente', 'Qtd Compras', 'Total Gasto']];
      const body = topCustomersData.map((r, i) => [
        (i + 1).toString(),
        r.name,
        r.count.toString(),
        `R$ ${r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      ]);
      autoTable(doc, { startY: 40, head, body, theme: 'grid' });
    } else if (reportId === 'produtos-curva-a') {
      const head = [['#', 'Produto', 'Qtd Vendida', 'Receita Total', 'Curva']];
      const body = curvaAData.map((r, i) => [
        (i + 1).toString(),
        r.name,
        r.quantity.toString(),
        `R$ ${r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        r.classification
      ]);
      autoTable(doc, { startY: 40, head, body, theme: 'grid' });
    } else if (reportId === 'desempenho-financeiro') {
      const head = [['Período', 'Receitas', 'Despesas', 'Saldo (Lucro Líquido)']];
      const body = financialData.map(r => [
        r.period,
        `R$ ${r.income.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `R$ ${r.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `R$ ${r.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      ]);
      autoTable(doc, { startY: 40, head, body, theme: 'grid' });
    } else if (reportId === 'dividas-fornecedor') {
      const head = [['Data', 'Compra/Lanç.', 'Fornecedor', 'Total', 'Pendente']];
      const body = dividasFornecedorData.map(r => [
        format(new Date(r.date), 'dd/MM/yyyy'),
        r.orderNumber !== 'Manual' ? `#${r.orderNumber}` : 'Manual',
        r.supplierName || r.supplierObj?.name || 'Fornecedor',
        `R$ ${r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `R$ ${r.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      ]);
      autoTable(doc, { startY: 40, head, body, theme: 'grid' });
    } else if (reportId === 'informacao-estoque') {
      const head = [['Referência', 'Cor', 'Qtd', 'V. Compra', 'Total']];
      const body = stockInfoData.map(r => [
        r.reference,
        r.color,
        r.quantity.toString(),
        `R$ ${r.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `R$ ${r.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      ]);
      body.push(['', '', '', 'Total Compra:', `R$ ${stockInfoTotals.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
      body.push(['', '', '', 'Total Venda:', `R$ ${stockInfoTotals.sale.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
      autoTable(doc, { startY: 40, head, body, theme: 'grid' });
    } else if (reportId === 'relacionamento-cliente') {
      const head = [['Data', 'Pedido', 'Cliente', 'Total', 'Pendente']];
      const body = relacionamentoClienteData.map(r => [
        format(new Date(r.date), 'dd/MM/yyyy'),
        r.orderNumber !== 'Manual' ? `#${r.orderNumber}` : 'Manual',
        r.customerObj?.name || r.customerName || 'Cliente',
        `R$ ${r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `R$ ${r.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      ]);
      autoTable(doc, { startY: 40, head, body, theme: 'grid' });
    }

    await sharePDF(doc, `${reportId}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
  };

  return (
    <div className={`flex flex-col h-full bg-[#f8f9fa] dark:bg-slate-950 pb-32 ${isDarkMode ? 'text-white' : 'text-slate-900'} overflow-y-auto`}>
      <div className="flex justify-between items-center px-4 pt-6 pb-2 sticky top-0 bg-[#f8f9fa] dark:bg-slate-950 z-10 w-full">
         <button
           onClick={onBack}
           title="Voltar"
           aria-label="Voltar para a tela anterior"
           className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-900 text-slate-400' : 'bg-white text-slate-500'} shadow-sm`}
         >
           <ArrowLeft size={20} />
         </button>
         <h1 className="text-xl font-black">{reportTitle}</h1>
         <button
           onClick={exportPDF}
           title="Compartilhar Relatório"
           aria-label="Compartilhar relatório"
           className="p-2 rounded-full bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
         >
            <Share2 size={18} />
         </button>
      </div>
      
      <div className="flex flex-col gap-4 px-4 mt-4 flex-grow pb-10">
        {/* Date Filter */}
         <div className={`p-5 rounded-3xl border shadow-sm ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                <Filter size={12} />
                Filtros
            </p>
            <div className="flex gap-2 items-center flex-wrap">
                <div className="relative flex-1 min-w-[140px]">
                    <input 
                        type="date" 
                        value={startDate}
                        title="Data Inicial"
                        placeholder="Data Inicial"
                        onChange={(e) => setStartDate(e.target.value)}
                        className={`w-full p-3 rounded-xl border text-xs font-bold ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                    />
                    <Calendar className={`absolute right-3 top-3.5 pointer-events-none ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} size={14} />
                </div>
                <span className="text-slate-400 text-xs font-bold">até</span>
                <div className="relative flex-1 min-w-[140px]">
                    <input 
                        type="date" 
                        value={endDate}
                        title="Data Final"
                        placeholder="Data Final"
                        onChange={(e) => setEndDate(e.target.value)}
                        className={`w-full p-3 rounded-xl border text-xs font-bold ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                    />
                    <Calendar className={`absolute right-3 top-3.5 pointer-events-none ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} size={14} />
                </div>
                {reportId === 'ventas-periodo' && (
                    <input 
                        type="text" 
                        placeholder="Buscar cliente..."
                        title="Buscar Cliente"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className={`flex-1 min-w-[200px] p-3 rounded-xl border text-xs font-bold ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                    />
                )}
                {reportId === 'informacao-estoque' && (
                    <input 
                        type="text" 
                        placeholder="Buscar modelo..."
                        title="Buscar Modelo"
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        className={`flex-1 min-w-[200px] p-3 rounded-xl border text-xs font-bold ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                    />
                )}
                {reportId === 'dividas-fornecedor' && (
                    <div className="flex flex-col gap-3 w-full mt-2">
                        <div className="flex gap-2 items-center flex-wrap">
                            <div className="flex-[2] min-w-[200px] z-20">
                                <ComboBox 
                                    options={suppliers}
                                    value={supplierId}
                                    onChange={(id) => setSupplierId(id)}
                                    placeholder="Buscar fornecedor..."
                                    isDarkMode={isDarkMode}
                                />
                            </div>
                            <select 
                                value={accountingFilter}
                                title="Filtrar por Tipo Contábil"
                                onChange={(e) => setAccountingFilter(e.target.value as any)}
                                className={`flex-1 min-w-[150px] p-3 rounded-2xl border text-xs font-bold ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                            >
                                <option value="ALL">Contábil & Não Contábil</option>
                                <option value="ACCOUNTING">Contábil</option>
                                <option value="NON_ACCOUNTING">Não Contábil</option>
                            </select>
                        </div>
                        <div className={`flex flex-col gap-2 p-3 rounded-xl border ${isDarkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Formato da Mensagem</span>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="msgFormatSup" 
                                        checked={messageFormat === 'RESUMO'} 
                                        onChange={() => setMessageFormat('RESUMO')} 
                                        className="accent-rose-500"
                                    />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Resumo (Totais)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="msgFormatSup" 
                                        checked={messageFormat === 'COMPLETO'} 
                                        onChange={() => setMessageFormat('COMPLETO')} 
                                        className="accent-rose-500"
                                    />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Histórico Completo (Itens)</span>
                                </label>
                            </div>
                            {supplierId && dividasFornecedorData.length > 0 && (
                                <button 
                                    onClick={openConsolidatedModal}
                                    className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-rose-700 transition-colors self-start"
                                >
                                    Gerar Mens. Consolidada
                                </button>
                            )}
                        </div>
                    </div>
                )}
                {reportId === 'relacionamento-cliente' && (
                    <div className="flex flex-col gap-3 w-full mt-2">
                        <div className="flex-[2] min-w-[200px] z-20">
                            <ComboBox 
                                options={customers}
                                value={customerRelSearchId}
                                onChange={(id) => setCustomerRelSearchId(id)}
                                placeholder="Selecione o Cliente..."
                                isDarkMode={isDarkMode}
                            />
                        </div>
                        <div className={`flex flex-col gap-2 p-3 rounded-xl border ${isDarkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Formato da Mensagem</span>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="msgFormat" 
                                        checked={messageFormat === 'RESUMO'} 
                                        onChange={() => setMessageFormat('RESUMO')} 
                                        className="accent-violet-500"
                                    />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Resumo (Totais)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="msgFormat" 
                                        checked={messageFormat === 'COMPLETO'} 
                                        onChange={() => setMessageFormat('COMPLETO')} 
                                        className="accent-violet-500"
                                    />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Histórico Completo (Itens)</span>
                                </label>
                            </div>
                            {customerRelSearchId && relacionamentoClienteData.length > 0 && (
                                <button 
                                    onClick={openConsolidatedModal}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-indigo-700 transition-colors"
                                >
                                    Gerar Mens. Consolidada
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
         </div>

        {/* Dynamic Content */}
        <div className={`p-1 rounded-3xl border shadow-sm overflow-hidden ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} mt-2`}>
            {reportId === 'informacao-estoque' && (
                 <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800">Referência</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800">Cor</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Qtd</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">V. Compra</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stockInfoData.map((r, i) => (
                                <tr key={i} className={`border-b last:border-0 dark:border-slate-800 ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}>
                                    <td className="p-3 text-xs font-bold">{r.reference}</td>
                                    <td className="p-3 text-xs font-bold">{r.color}</td>
                                    <td className="p-3 text-xs text-right font-bold text-slate-500">{r.quantity}</td>
                                    <td className="p-3 text-xs text-right font-bold text-slate-500">R$ {r.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-xs text-right font-black text-indigo-500">R$ {r.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                            {stockInfoData.length > 0 && (
                                <tr className="border-t-2 dark:border-slate-700">
                                    <td colSpan={4} className="p-3 text-xs font-black text-right text-slate-500">Total Compra:</td>
                                    <td className="p-3 text-xs font-black text-right text-indigo-600">R$ {stockInfoTotals.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            )}
                               {stockInfoData.length > 0 && (
                                <tr className="border-t-2 dark:border-slate-700">
                                    <td colSpan={4} className="p-3 text-xs font-black text-right text-slate-500">Total Venda:</td>
                                    <td className="p-3 text-xs font-black text-right text-emerald-600">R$ {stockInfoTotals.sale.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            )}
                            {stockInfoData.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-50">
                                            <Filter size={20} className="text-slate-400" />
                                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Nenhum dado encontrado</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            {reportId === 'dividas-fornecedor' && (
                 <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800">Fornecedor</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800">Documento</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Pendente</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dividasFornecedorData.map((r, i) => (
                                <tr key={r.id} className={`border-b last:border-0 dark:border-slate-800 ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}>
                                    <td className="p-3 text-xs font-bold">
                                        <div className="flex flex-col">
                                            <span className="truncate max-w-[150px]">{r.supplierObj?.name || r.supplierName || 'Fornecedor'}</span>
                                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{format(new Date(r.date), 'dd/MM/yyyy')}</span>
                                        </div>
                                    </td>
                                    <td className="p-3 text-xs font-bold">
                                        {r.isManual ? (
                                            r.orderNumber && r.orderNumber !== 'Manual' ? (
                                                <span className="flex items-center gap-1">
                                                    <Hash size={10} className="text-slate-400" />
                                                    {r.orderNumber}
                                                </span>
                                            ) : 'Manual'
                                        ) : `#${r.orderNumber}`}
                                    </td>
                                    <td className={`p-3 text-xs text-right font-black ${r.pending > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>R$ {r.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="p-3 flex justify-center gap-2">
                                        <button 
                                            onClick={() => handleCopyMessage(r)}
                                            className={`p-1.5 rounded-lg border transition-colors ${copiedId === r.id ? 'bg-emerald-500 text-white border-emerald-500' : isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-rose-600'}`}
                                            title="Copiar Mensagem"
                                        >
                                            {copiedId === r.id ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                        <button 
                                            onClick={() => handleWhatsApp(r)}
                                            className={`p-1.5 rounded-lg border transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-emerald-500 hover:text-white hover:border-emerald-500' : 'bg-white border-slate-200 text-emerald-600 hover:bg-emerald-500 hover:text-white hover:border-emerald-500'}`}
                                            title="Enviar WhatsApp"
                                        >
                                            <MessageCircle size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {dividasFornecedorData.length > 0 && (
                                <tr className={`${isDarkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                                    <td colSpan={2} className="p-3 text-right text-[10px] font-black uppercase text-slate-400">Total Geral de Dívidas:</td>
                                    <td className="p-3 text-right font-black text-rose-600 text-sm">
                                        R$ {dividasFornecedorData.reduce((acc, curr) => acc + curr.pending, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td></td>
                                </tr>
                            )}
                            {dividasFornecedorData.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-12 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-50">
                                            <Filter size={20} className="text-slate-400" />
                                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Nenhum dado encontrado</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            {reportId === 'ventas-periodo' && (
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800">Período</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Vendas</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Total</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Pendente</th>
                            </tr>
                        </thead>
                        <tbody>
                            {salesByPeriodData.map((r, i) => (
                                <tr key={i} className={`border-b last:border-0 dark:border-slate-800 ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}>
                                    <td className="p-3 text-xs font-bold">{r.period}</td>
                                    <td className="p-3 text-xs text-right font-bold text-slate-500">{r.count}</td>
                                    <td className="p-3 text-xs text-right font-black text-indigo-500">R$ {r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-xs text-right font-bold text-rose-500">
                                        {r.pending > 0 ? `R$ ${r.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                    </td>
                                </tr>
                            ))}
                            {salesByPeriodData.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-12 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-50">
                                            <Filter size={20} className="text-slate-400" />
                                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Nenhum dado encontrado</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {reportId === 'clientes-mais-compram' && (
                 <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800">#</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800">Cliente</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Compras</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Gasto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topCustomersData.map((r, i) => (
                                <tr key={i} className={`border-b last:border-0 dark:border-slate-800 ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}>
                                    <td className="p-3 text-xs font-bold text-slate-400">{i + 1}º</td>
                                    <td className="p-3 text-xs font-bold">{r.name}</td>
                                    <td className="p-3 text-xs text-right font-bold text-slate-500">{r.count}</td>
                                    <td className="p-3 text-xs text-right font-black text-emerald-500">R$ {r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                            {topCustomersData.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-12 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-50">
                                            <Filter size={20} className="text-slate-400" />
                                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Nenhum dado encontrado</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {reportId === 'produtos-curva-a' && (
                 <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800">Produto</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800">Cor</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800">Categoria</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Qtd</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-center">Curva</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {curvaAData.map((r, i) => (
                                <tr key={i} className={`border-b last:border-0 dark:border-slate-800 ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}>
                                    <td className="p-3 text-[10px] font-bold uppercase truncate max-w-[120px]">{r.name}</td>
                                    <td className="p-3 text-[10px] font-bold uppercase truncate max-w-[120px]">{r.colorName}</td>
                                    <td className="p-3 text-[10px] font-bold uppercase truncate max-w-[120px]">{r.categoryName}</td>
                                    <td className="p-3 text-xs text-right font-bold text-slate-500">{r.quantity}</td>
                                    <td className="p-3 text-center">
                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                            r.classification === 'A' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' : 
                                            r.classification === 'B' ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' : 
                                            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                        }`}>
                                            {r.classification}
                                        </span>
                                    </td>
                                    <td className="p-3 text-xs text-right font-black text-amber-500">R$ {r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                            {curvaAData.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-50">
                                            <Filter size={20} className="text-slate-400" />
                                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Nenhum dado encontrado</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {reportId === 'desempenho-financeiro' && (
                 <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800">Período</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Receitas</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Despesas</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {financialData.map((r, i) => (
                                <tr key={i} className={`border-b last:border-0 dark:border-slate-800 ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}>
                                    <td className="p-3 text-xs font-bold">{r.period}</td>
                                    <td className="p-3 text-xs text-right font-bold text-emerald-500">R$ {r.income.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="p-3 text-xs text-right font-bold text-rose-500">R$ {r.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className={`p-3 text-xs text-right font-black ${r.balance >= 0 ? 'text-blue-500' : 'text-rose-600'}`}>R$ {r.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                            {financialData.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-12 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-50">
                                            <Filter size={20} className="text-slate-400" />
                                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Nenhum dado encontrado</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            
            {reportId === 'relacionamento-cliente' && (
                 <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800">Cliente</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800">Pedido</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-right">Pendente</th>
                                <th className="p-3 text-[10px] font-black uppercase text-slate-400 border-b dark:border-slate-800 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {relacionamentoClienteData.map((r, i) => (
                                <tr key={r.id} className={`border-b last:border-0 dark:border-slate-800 ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}>
                                    <td className="p-3 text-xs font-bold">
                                        <div className="flex flex-col">
                                            <span className="truncate max-w-[150px]">{r.customerObj?.name || r.customerName || 'Cliente'}</span>
                                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{format(new Date(r.date), 'dd/MM/yyyy')}</span>
                                        </div>
                                    </td>
                                    <td className="p-3 text-xs font-bold">
                                        {r.isManual ? (
                                            r.orderNumber && r.orderNumber !== 'Manual' ? (
                                                <span className="flex items-center gap-1">
                                                    <Hash size={10} className="text-slate-400" />
                                                    {r.orderNumber}
                                                </span>
                                            ) : 'Manual'
                                        ) : `#${r.orderNumber}`}
                                    </td>
                                    <td className={`p-3 text-xs text-right font-black ${r.pending > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>R$ {r.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="p-3 flex justify-center gap-2">
                                        <button 
                                            onClick={() => handleCopyMessage(r)}
                                            className={`p-1.5 rounded-lg border transition-colors ${copiedId === r.id ? 'bg-emerald-500 text-white border-emerald-500' : isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-indigo-600'}`}
                                            title="Copiar Mensagem"
                                        >
                                            {copiedId === r.id ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                        <button 
                                            onClick={() => handleWhatsApp(r)}
                                            className={`p-1.5 rounded-lg border transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-emerald-500 hover:text-white hover:border-emerald-500' : 'bg-white border-slate-200 text-emerald-600 hover:bg-emerald-500 hover:text-white hover:border-emerald-500'}`}
                                            title="Enviar WhatsApp"
                                        >
                                            <MessageCircle size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {relacionamentoClienteData.length > 0 && (
                                <tr className={`${isDarkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                                    <td colSpan={2} className="p-3 text-right text-[10px] font-black uppercase text-slate-400">Total Geral em Aberto:</td>
                                    <td className="p-3 text-right font-black text-rose-600 text-sm">
                                        R$ {relacionamentoClienteData.reduce((acc, curr) => acc + curr.pending, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td></td>
                                </tr>
                            )}
                            {relacionamentoClienteData.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="p-12 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-50">
                                            <Filter size={20} className="text-slate-400" />
                                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Nenhum dado encontrado</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

        </div>
      </div>

      {isConsolidatedModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className={`w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] ${isDarkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white'}`}>
              <div className={`p-6 border-b flex justify-between items-center ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                <div>
                  <h2 className="text-xl font-black">Mensagem Consolidada</h2>
                  <p className="text-sm text-slate-500">Selecione os itens para enviar ao cliente</p>
                </div>
                <button onClick={() => setIsConsolidatedModalOpen(false)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                  X
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-bold uppercase text-slate-400">
                    {reportId === 'dividas-fornecedor' ? 'Compras/Lançamentos do Fornecedor' : 'Itens do Cliente'}
                  </h3>
                  <div className={`border rounded-xl overflow-hidden ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                    {(reportId === 'dividas-fornecedor' ? dividasFornecedorData : relacionamentoClienteData).map((item, idx, arr) => (
                      <label key={item.id} className={`flex items-center gap-4 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${idx !== arr.length - 1 ? 'border-b ' + (isDarkMode ? 'border-slate-800' : 'border-slate-100') : ''}`}>
                        <input 
                          type="checkbox" 
                          checked={selectedConsolidatedIds.has(item.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedConsolidatedIds);
                            if (e.target.checked) newSet.add(item.id);
                            else newSet.delete(item.id);
                            setSelectedConsolidatedIds(newSet);
                          }}
                          className={`w-5 h-5 rounded border-slate-300 focus:ring-0 ${reportId === 'dividas-fornecedor' ? 'text-rose-600' : 'text-indigo-600'}`}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-bold">{item.isManual ? 'Lançamento Manual' : (reportId === 'dividas-fornecedor' ? `Compra #${item.orderNumber}` : `Pedido #${item.orderNumber}`)}</p>
                          <p className="text-xs text-slate-500">{format(new Date(item.date), 'dd/MM/yyyy')} {item.isManual && `- ${item.description}`}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-slate-700 dark:text-slate-300">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          <p className={`text-xs font-bold ${item.pending > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>Pendente: R$ {item.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-bold uppercase text-slate-400">Prévia da Mensagem</h3>
                  <textarea 
                    readOnly
                    value={generateConsolidatedMessage()}
                    className={`w-full h-40 p-4 rounded-xl text-sm resize-none focus:outline-none ${isDarkMode ? 'bg-slate-950 text-slate-300 border-slate-800' : 'bg-slate-50 text-slate-700 border-slate-200'} border`}
                  />
                </div>
              </div>

              <div className={`p-6 border-t flex flex-wrap justify-end gap-3 ${isDarkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'} rounded-b-3xl`}>
                <button 
                  onClick={exportConsolidatedPDF}
                  className="px-6 py-3 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all active:scale-95 flex items-center gap-2"
                >
                  <Share2 size={16} />
                  Exportar PDF
                </button>
                <button 
                  onClick={handleCopyConsolidated}
                  className={`px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-colors ${isDarkMode ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-white text-slate-700 border hover:bg-slate-50'}`}
                >
                  <Copy size={18} />
                  Copiar Texto
                </button>
                <button 
                  onClick={handleWhatsAppConsolidated}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-emerald-500/30 transition-colors"
                >
                  <MessageCircle size={18} />
                  Enviar WhatsApp
                </button>
              </div>
            </div>
          </div>
      )}

    </div>
  );
}
