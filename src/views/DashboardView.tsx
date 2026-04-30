import { useState, useMemo, ReactNode } from "react";
import { Sale, Purchase, Product, CompanyCheck, Transaction, TransactionType, Account, AccountType, SaleStatus, Person, ViewType } from "../types";
import {
  TrendingUp,
  TrendingDown,
  Package,
  ShoppingBag,
  History,
  CreditCard,
  CheckCircle2,
  Clock,
  DollarSign,
  Wallet,
  Boxes,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  X,
  RefreshCcw,
  AlertCircle,
  Hash,
  Calendar,
  Copy,
  FileDown,
  Clipboard,
  Landmark,
  User
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface DashboardViewProps {
  sales: Sale[];
  purchases: Purchase[];
  products: Product[];
  transactions: Transaction[];
  accounts: Account[];
  people: Person[];
  onCheckStatusChange: (
    purchaseId: string,
    checkId: string,
    newStatus: "PENDING" | "CLEARED" | "OVERDUE",
  ) => void;
  onNavigate: (view: ViewType, id?: string | null, search?: string) => void;
  isDarkMode: boolean;
}

export default function DashboardView({
  sales,
  purchases,
  products,
  transactions,
  accounts,
  people,
  onCheckStatusChange,
  onNavigate,
  isDarkMode,
}: DashboardViewProps) {
  const [checksSearch, setChecksSearch] = useState("");
  const [lowStockSearch, setLowStockSearch] = useState("");
  const [customerDebtsSearch, setCustomerDebtsSearch] = useState("");
  const [supplierDebtsSearch, setSupplierDebtsSearch] = useState("");
  const [checksStatusFilter, setChecksStatusFilter] = useState<'ALL' | 'PENDING' | 'CLEARED' | 'OVERDUE'>('PENDING');
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [isRecentActivityExpanded, setIsRecentActivityExpanded] = useState(false);
  
  const [customerDashboardTab, setCustomerDashboardTab] = useState<'DEBITS' | 'CREDITS'>('DEBITS');
  const [supplierDashboardTab, setSupplierDashboardTab] = useState<'DEBITS' | 'CREDITS'>('DEBITS');

  const customersWithCredits = useMemo(() => {
    return people
      .filter(p => p.isCustomer && (p.credit || 0) > 0.01)
      .filter(p => p.name.toLowerCase().includes(customerDebtsSearch.toLowerCase()))
      .sort((a, b) => (b.credit || 0) - (a.credit || 0));
  }, [people, customerDebtsSearch]);

  const suppliersWithCredits = useMemo(() => {
    return people
      .filter(p => p.isSupplier && (p.credit || 0) > 0.01)
      .filter(p => p.name.toLowerCase().includes(supplierDebtsSearch.toLowerCase()))
      .sort((a, b) => (b.credit || 0) - (a.credit || 0));
  }, [people, supplierDebtsSearch]);


  const statusMap: Record<string, { label: string, color: string }> = {
    'PENDING': { label: 'PENDENTE', color: 'text-amber-500' },
    'CLEARED': { label: 'LIQUIDADO', color: 'text-emerald-500' },
    'OVERDUE': { label: 'VENCIDO', color: 'text-rose-500' }
  };

  const downloadChecksPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.setTextColor(63, 81, 181);
    doc.text('Relatório de Cheques', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);
    
    const tableData = filteredChecks.map(c => [
      c.number,
      c.supplierName,
      format(c.dueDate, 'dd/MM/yyyy'),
      statusMap[c.status]?.label || c.status,
      `R$ ${c.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Nº Cheque', 'Fornecedor', 'Bom Para', 'Situação', 'Valor']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8, cellPadding: 3 }
    });

    doc.save(`relatorio_cheques_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
  };

  const suppliersWithDebts = useMemo(() => {
    const debtsBySupplier: Record<string, { person: Person, totalDebt: number, pendingCount: number }> = {};

    purchases.forEach(purchase => {
      if (purchase.generateTransaction === false) return; // Do not include "Não Contábil"
      const totalPaid = (purchase.paymentHistory || []).reduce((acc, p) => acc + p.amount, 0);
      const debt = purchase.total - totalPaid;
      if (debt > 0.01) {
        if (!debtsBySupplier[purchase.supplierId || ""]) {
          const person = people.find(p => p.id === purchase.supplierId);
          if (person) {
            debtsBySupplier[purchase.supplierId!] = { person, totalDebt: 0, pendingCount: 0 };
          }
        }
        if (debtsBySupplier[purchase.supplierId || ""]) {
          debtsBySupplier[purchase.supplierId!].totalDebt += debt;
          debtsBySupplier[purchase.supplierId!].pendingCount += 1;
        }
      }
    });

    return Object.values(debtsBySupplier)
      .filter(item => item.person.name.toLowerCase().includes(supplierDebtsSearch.toLowerCase()))
      .sort((a, b) => b.totalDebt - a.totalDebt);
  }, [purchases, people, supplierDebtsSearch]);

  const customersWithDebts = useMemo(() => {
    const debtsByCustomer: Record<string, { person: Person, totalDebt: number, pendingCount: number }> = {};

    sales.forEach(sale => {
      if (sale.status === SaleStatus.CANCELLED) return;
      const totalPaid = (sale.paymentHistory || []).reduce((acc, p) => acc + p.amount, 0);
      const debt = sale.total - totalPaid;
      if (debt > 0.01) {
        if (!debtsByCustomer[sale.customerId || ""]) {
          const person = people.find(p => p.id === sale.customerId);
          if (person) {
            debtsByCustomer[sale.customerId!] = { person, totalDebt: 0, pendingCount: 0 };
          }
        }
        if (debtsByCustomer[sale.customerId || ""]) {
          debtsByCustomer[sale.customerId!].totalDebt += debt;
          debtsByCustomer[sale.customerId!].pendingCount += 1;
        }
      }
    });

    return Object.values(debtsByCustomer)
      .filter(item => item.person.name.toLowerCase().includes(customerDebtsSearch.toLowerCase()))
      .sort((a, b) => b.totalDebt - a.totalDebt);
  }, [sales, people, customerDebtsSearch]);

  const stats = useMemo(() => {
    const businessAccounts = accounts.filter(a => a.type !== AccountType.PERSONAL);
    const businessTransactions = transactions.filter(t => !t.isPersonal && accounts.find(a => a.id === t.accountId)?.type !== AccountType.PERSONAL);

    // Balanço unificado pelas contas comerciais
    const consolidatedBalance = businessAccounts.reduce((acc, a) => acc + (a.balance || 0), 0);
    
    // Movimentação mensal pelas transações confirmadas (comerciais)
    const now = new Date();
    
    const monthlyIncome = businessTransactions
      .filter(t => t.status === 'COMPLETED' && t.type === TransactionType.INCOME)
      .reduce((acc, t) => acc + t.amount, 0);
      
    const monthlyExpenses = businessTransactions
      .filter(t => t.status === 'COMPLETED' && t.type === TransactionType.EXPENSE)
      .reduce((acc, t) => acc + t.amount, 0);

    const lowStockProducts = products.filter(p => {
      return p.variations.some(
        (v) =>
          Object.values(v.stock).reduce((sum, s) => sum + s, 0) < (v.minStock || 0),
      );
    });

    const lowStockAlerts = lowStockProducts.length;

    const stockSummary = products.reduce((acc, p) => {
      let totalQty = 0;
      p.variations.forEach(v => {
        const qty = Object.values(v.stock).reduce((sum, s) => sum + s, 0);
        totalQty += qty;
        
        // Group by color
        const colorName = v.colorName || 'Sem Cor';
        acc.stockByColor[colorName] = (acc.stockByColor[colorName] || 0) + qty;
      });

      acc.totalCostValue += totalQty * (p.costPrice || 0);
      acc.totalSaleValue += totalQty * (p.salePrice || 0);
      
      return acc;
    }, { totalCostValue: 0, totalSaleValue: 0, stockByColor: {} as Record<string, number> });

    // Sort colors by quantity
    const topColors = Object.entries(stockSummary.stockByColor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const pendingReceivables = sales
      .filter(s => s.status !== SaleStatus.CANCELLED)
      .reduce((acc, sale) => {
        const totalPaid = (sale.paymentHistory || []).reduce((acc, p) => acc + p.amount, 0);
        return acc + Math.max(0, sale.total - totalPaid);
      }, 0);

    return { 
      consolidatedBalance, 
      monthlyIncome, 
      monthlyExpenses, 
      lowStockAlerts, 
      lowStockProducts,
      totalStockCostValue: stockSummary.totalCostValue,
      totalStockSaleValue: stockSummary.totalSaleValue,
      topColors,
      pendingReceivables
    };
  }, [transactions, accounts, products, sales]);

  const recentActivity = useMemo(() => {
    const businessTransactions = transactions.filter(t => !t.isPersonal && accounts.find(a => a.id === t.accountId)?.type !== AccountType.PERSONAL);
    const combined = [
      ...sales
        .filter(s => s.status !== SaleStatus.CANCELLED) // Ocultando canceladas do resumo de atividade do dashboard (opcional, ou podemos mostrar como canceladas)
        .map((s) => ({ ...s, activityType: "sale" as const })),
      ...purchases.map((p) => ({ ...p, activityType: "purchase" as const })),
      ...businessTransactions.map((t) => ({ ...t, activityType: "transaction" as const, total: t.amount, activityStatus: t.status })),
    ].sort((a, b) => b.date - a.date);
    return combined.slice(0, 10);
  }, [sales, purchases, transactions, accounts]);

  const filteredChecks = useMemo(() => {
    const checks: (CompanyCheck & {
      purchaseId: string;
      supplierId: string;
      supplierName: string;
    })[] = [];
    
    purchases.forEach((p) => {
      const supplier = people.find(s => s.id === p.supplierId);
      if (p.checks && p.checks.length > 0) {
        checks.push(
          ...p.checks.map((c) => ({
            ...c,
            purchaseId: p.id,
            supplierId: p.supplierId,
            supplierName: supplier?.name || "Desconhecido",
          })),
        );
      }
    });

    return checks
      .filter(c => {
        const matchesSearch = c.number.toLowerCase().includes(checksSearch.toLowerCase()) || 
                             c.supplierName.toLowerCase().includes(checksSearch.toLowerCase());
        const matchesStatus = checksStatusFilter === 'ALL' || c.status === checksStatusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => a.dueDate - b.dueDate);
  }, [purchases, people, checksSearch, checksStatusFilter]);

  return (
    <div className="flex flex-col gap-4 pb-40 px-4 bg-[#fafafa] dark:bg-slate-950 min-h-screen">
      {/* Primary Stats */}
      <div className="flex flex-col gap-4 pt-4">
        <div
          onClick={() => onNavigate(ViewType.FINANCIAL)}
          className={`cursor-pointer p-6 rounded-[1.5rem] border shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] flex justify-between items-center ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}
        >
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
              Saldo Consolidado
            </p>
            <p
              className={`text-3xl font-black tracking-tight leading-none ${isDarkMode ? "text-white" : "text-slate-900"}`}
            >
              R${" "}
              {stats.consolidatedBalance.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-500">
            <Wallet size={28} strokeWidth={2.5} />
          </div>
        </div>

        <div
          onClick={() => onNavigate(ViewType.FINANCIAL)}
          className={`cursor-pointer p-6 rounded-[1.5rem] border shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] flex justify-between items-center ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}
        >
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
              Balanço Mensal (Liquidados)
            </p>
            <p className={`text-2xl font-black tracking-tight leading-none ${stats.monthlyIncome - stats.monthlyExpenses >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              R$ {(stats.monthlyIncome - stats.monthlyExpenses).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
            </p>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${stats.monthlyIncome - stats.monthlyExpenses >= 0 ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
            <TrendingUp size={24} strokeWidth={2.5} />
          </div>
        </div>

        <div
          onClick={() => onNavigate(ViewType.FINANCIAL)}
          className={`cursor-pointer p-6 rounded-[1.5rem] border shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] flex justify-between items-center ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}
        >
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
              A Receber (Pendente)
            </p>
            <p
              className={`text-2xl font-black tracking-tight leading-none ${isDarkMode ? "text-white" : "text-slate-900"}`}
            >
              R${" "}
              {stats.pendingReceivables.toLocaleString("pt-BR", {
                minimumFractionDigits: 0,
              })}
            </p>
          </div>
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-500">
            <DollarSign size={24} strokeWidth={2.5} />
          </div>
        </div>

        <div className={`p-6 rounded-[1.5rem] border shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] flex flex-col gap-4 ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                Alertas de Estoque
                {stats.lowStockAlerts > 0 && (
                    <span className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] pb-[1px]">
                    {stats.lowStockAlerts}
                    </span>
                )}
              </p>
            </div>
            <button
                onClick={() => onNavigate(ViewType.STOCK)}                
                className="text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-600 dark:text-indigo-400"
            >
                Ver tudo
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" size={14} />
            <input 
                type="text"
                placeholder="BUSCAR PRODUTO..."
                className="w-full bg-slate-50 dark:bg-slate-950 border-none rounded-xl pl-9 pr-4 py-2.5 text-[10px] font-black uppercase tracking-widest placeholder:text-slate-300 dark:placeholder:text-slate-700"
                value={lowStockSearch}
                onChange={(e) => setLowStockSearch(e.target.value)}
            />
          </div>

          <div className="h-[200px] overflow-y-auto space-y-2 pr-1 no-scrollbar">
            {stats.lowStockProducts.filter(p => p.name.toLowerCase().includes(lowStockSearch.toLowerCase())).map((product) => (
                product.variations
                  .filter(v => Object.values(v.stock).reduce((sum: number, s: any) => sum + Number(s || 0), 0) < (v.minStock || 0))
                  .map((variation, vIdx) => (
                    <div key={`${product.id}-${vIdx}`} className={`p-3 rounded-xl border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{product.name}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">
                          Cor: {variation.colorName || 'Padrão'} | Qtd: {Object.values(variation.stock).reduce((sum: number, s: any) => sum + Number(s || 0), 0)}
                        </p>
                    </div>
                ))
            ))}
            {stats.lowStockProducts.filter(p => p.name.toLowerCase().includes(lowStockSearch.toLowerCase())).flatMap(p => p.variations.filter(v => Object.values(v.stock).reduce((sum: number, s: any) => sum + Number(s || 0), 0) < (v.minStock || 0))).length === 0 && (
                 <p className="text-[10px] text-center text-slate-400 py-4">Nenhum produto baixo encontrado.</p>
            )}
          </div>
        </div>

        

        <div className={`p-6 rounded-[1.5rem] border shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] flex flex-col gap-4 ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-none">Relacionamento Clientes</p>
          <div className="flex justify-between items-center">
            <div className={`flex border p-0.5 rounded-xl shadow-sm dark:shadow-none ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
              <button 
                onClick={() => setCustomerDashboardTab('DEBITS')}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${customerDashboardTab === 'DEBITS' ? 'bg-slate-500 dark:bg-slate-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              >
                DÉBITOS
                {customersWithDebts.length > 0 && (
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-white items-center justify-center text-[8px] font-bold">
                      {customersWithDebts.length}
                    </span>
                  </span>
                )}
              </button>
              <button 
                onClick={() => setCustomerDashboardTab('CREDITS')}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${customerDashboardTab === 'CREDITS' ? 'bg-slate-500 dark:bg-slate-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              >
                CRÉDITOS
                {customersWithCredits.length > 0 && (
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-white items-center justify-center text-[8px] font-bold">
                      {customersWithCredits.length}
                    </span>
                  </span>
                )}
              </button>
            </div>
            <button
                onClick={() => onNavigate(ViewType.SALES)}                
                className="text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-600 dark:text-indigo-400"
            >
                Ver tudo
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" size={14} />
            <input 
                type="text"
                placeholder="BUSCAR CLIENTE..."
                className="w-full bg-slate-50 dark:bg-slate-950 border-none rounded-xl pl-9 pr-4 py-2.5 text-[10px] font-black uppercase tracking-widest placeholder:text-slate-300 dark:placeholder:text-slate-700"
                value={customerDebtsSearch}
                onChange={(e) => setCustomerDebtsSearch(e.target.value)}
            />
          </div>

          <div className="h-[200px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {customerDashboardTab === 'DEBITS' ? (
              <>
                {customersWithDebts.map((item, idx) => (
                    <div 
                      key={`cust-debt-${item.person.id}-${idx}`} 
                      onClick={() => onNavigate(ViewType.SALES, null, item.person.name)}
                      className={`p-3 rounded-xl border cursor-pointer transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}
                    >
                        <div className="flex justify-between items-center">
                          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-tight">{item.person.name}</p>
                          <p className="text-[11px] font-black text-rose-500">
                            R$ {item.totalDebt.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <p className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-widest">
                          {item.pendingCount} {item.pendingCount === 1 ? 'venda pendente' : 'vendas pendentes'}
                        </p>
                    </div>
                ))}
                {customersWithDebts.length === 0 && (
                     <p className="text-[10px] text-center text-slate-400 py-4">Nenhum cliente com débito.</p>
                )}
              </>
            ) : (
              <>
                {customersWithCredits.map((person, idx) => (
                    <div 
                      key={`cust-cred-${person.id}-${idx}`} 
                      className={`p-3 rounded-xl border transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}
                    >
                        <div className="flex justify-between items-center">
                          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-tight">{person.name}</p>
                          <p className="text-[11px] font-black text-emerald-500">
                            R$ {(person.credit || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                    </div>
                ))}
                {customersWithCredits.length === 0 && (
                     <p className="text-[10px] text-center text-slate-400 py-4">Nenhum cliente com crédito.</p>
                )}
              </>
            )}
          </div>
        </div>

        

        <div className={`p-6 rounded-[1.5rem] border shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] flex flex-col gap-4 ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-none">Relacionamento Fornecedores</p>
          <div className="flex justify-between items-center">
            <div className={`flex border p-0.5 rounded-xl shadow-sm dark:shadow-none ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
              <button 
                onClick={() => setSupplierDashboardTab('DEBITS')}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${supplierDashboardTab === 'DEBITS' ? 'bg-slate-500 dark:bg-slate-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              >
                DÉBITOS
                {suppliersWithDebts.length > 0 && (
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-white items-center justify-center text-[8px] font-bold">
                      {suppliersWithDebts.length}
                    </span>
                  </span>
                )}
              </button>
              <button 
                onClick={() => setSupplierDashboardTab('CREDITS')}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 ${supplierDashboardTab === 'CREDITS' ? 'bg-slate-500 dark:bg-slate-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              >
                CRÉDITOS
                {suppliersWithCredits.length > 0 && (
                  <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-white items-center justify-center text-[8px] font-bold">
                      {suppliersWithCredits.length}
                    </span>
                  </span>
                )}
              </button>
            </div>
            <button
                onClick={() => onNavigate(ViewType.PURCHASES)}                
                className="text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-600 dark:text-indigo-400"
            >
                Ver tudo
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" size={14} />
            <input 
                type="text"
                placeholder="BUSCAR FORNECEDOR..."
                className="w-full bg-slate-50 dark:bg-slate-950 border-none rounded-xl pl-9 pr-4 py-2.5 text-[10px] font-black uppercase tracking-widest placeholder:text-slate-300 dark:placeholder:text-slate-700"
                value={supplierDebtsSearch}
                onChange={(e) => setSupplierDebtsSearch(e.target.value)}
            />
          </div>

          <div className="h-[200px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {supplierDashboardTab === 'DEBITS' ? (
              <>
                {suppliersWithDebts.map((item, idx) => (
                    <div 
                      key={`sup-debt-${item.person.id}-${idx}`} 
                      onClick={() => onNavigate(ViewType.PURCHASES, null, item.person.name)}
                      className={`p-3 rounded-xl border cursor-pointer transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}
                    >
                        <div className="flex justify-between items-center">
                          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-tight">{item.person.name}</p>
                          <p className="text-[11px] font-black text-rose-500">
                            R$ {item.totalDebt.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <p className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-widest">
                          {item.pendingCount} {item.pendingCount === 1 ? 'compra pendente' : 'compras pendentes'}
                        </p>
                    </div>
                ))}
                {suppliersWithDebts.length === 0 && (
                     <p className="text-[10px] text-center text-slate-400 py-4">Nenhum débito com fornecedor.</p>
                )}
              </>
            ) : (
              <>
                {suppliersWithCredits.map((person, idx) => (
                    <div 
                      key={`sup-cred-${person.id}-${idx}`} 
                      className={`p-3 rounded-xl border transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}
                    >
                        <div className="flex justify-between items-center">
                          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-tight">{person.name}</p>
                          <p className="text-[11px] font-black text-emerald-500">
                            R$ {(person.credit || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                    </div>
                ))}
                {suppliersWithCredits.length === 0 && (
                     <p className="text-[10px] text-center text-slate-400 py-4">Nenhum crédito com fornecedor.</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Simplified Card: Stock Value and Potential */}
        <div
          onClick={() => onNavigate(ViewType.STOCK)}
          className={`cursor-pointer p-6 rounded-[2rem] border shadow-[0_4px_20px_-6px_rgba(0,0,0,0.1)] flex flex-col justify-center min-h-[140px] ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}
        >
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                Patrimônio em Estoque
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">CUSTO:</span>
                <p className={`text-2xl font-black tracking-tighter ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                  R$ {stats.totalStockCostValue.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                 <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                    Venda: R$ {stats.totalStockSaleValue.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                 </p>
              </div>
            </div>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${isDarkMode ? 'bg-amber-900/20 text-amber-500 shadow-amber-900/10' : 'bg-amber-50 text-amber-600 shadow-amber-100/50'}`}>
              <Boxes size={32} strokeWidth={2.5} />
            </div>
          </div>
        </div>
      </div>

      {/* Accordion Card for Checks */}
      <section className="mt-2">
        <div
          className={`rounded-[2.5rem] border shadow-sm overflow-hidden flex flex-col ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}
        >
          {/* Card Header with Filters */}
          <div className="p-6 pb-2">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className={`text-lg font-black uppercase tracking-tight ${isDarkMode ? "text-white" : "text-slate-800"}`}>
                  Relatório de Cheques
                </h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Gestão Unificada de Documentos</p>
              </div>
              <div className="flex items-center gap-2">
                <div className={`p-2.5 rounded-xl ${isDarkMode ? 'bg-amber-900/20 text-amber-500' : 'bg-amber-50 text-amber-600'}`}>
                  <CreditCard size={20} strokeWidth={2.5} />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {/* Action Bar */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clipboard size={14} className="text-indigo-500" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total: {filteredChecks.length} cheques</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[8px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all border border-slate-100 dark:border-slate-700 active:scale-95"
                    onClick={() => {
                      const summary = filteredChecks.map(c => `${c.number} - R$ ${c.value.toLocaleString('pt-BR')} - ${format(c.dueDate, 'dd/MM/yyyy')}`).join('\n');
                      navigator.clipboard.writeText(summary);
                      alert('Lista de cheques copiada!');
                    }}
                  >
                    <Copy size={12} />
                    Copiar
                  </button>
                  <button 
                    onClick={downloadChecksPDF}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-[8px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100 dark:border-indigo-900/50 active:scale-95"
                  >
                    <FileDown size={14} />
                    PDF
                  </button>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" size={16} />
                <input 
                  type="text"
                  placeholder="BUSCAR POR NÚMERO OU FORNECEDOR..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border-none rounded-2xl pl-12 pr-4 py-3.5 text-[11px] font-black uppercase tracking-widest placeholder:text-slate-300 dark:placeholder:text-slate-800 focus:ring-4 focus:ring-indigo-500/5 transition-all text-slate-800 dark:text-white"
                  value={checksSearch}
                  onChange={(e) => setChecksSearch(e.target.value)}
                />
                {checksSearch && (
                  <button onClick={() => setChecksSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300">
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="flex gap-2 p-1 bg-slate-50 dark:bg-slate-950 rounded-2xl overflow-x-auto no-scrollbar">
                {(['PENDING', 'OVERDUE', 'CLEARED', 'ALL'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setChecksStatusFilter(status)}
                    className={`flex-1 py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${checksStatusFilter === status ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-700'}`}
                  >
                    {status === 'PENDING' ? 'A Vencer' : status === 'CLEARED' ? 'Compensados' : status === 'OVERDUE' ? 'Vencidos' : 'Todos'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 flex flex-col gap-3">
            {filteredChecks.length > 0 ? (
              filteredChecks.map((check) => {
                const daysUntil = differenceInDays(check.dueDate, new Date());
                const isLate = check.status === "PENDING" && daysUntil < 0;
                const isToday = check.status === "PENDING" && daysUntil === 0;
                const isNearVenc = check.status === "PENDING" && daysUntil > 0 && daysUntil <= 3;
                
                const isExpanded = expandedCheckId === check.id;

                return (
                  <div key={check.id} className={`p-5 rounded-3xl border-2 border-dashed transition-all ${isExpanded ? (isDarkMode ? 'bg-slate-800/50 border-indigo-500/50' : 'bg-slate-50/50 border-indigo-200') : (isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50/50 border-slate-100')}`}>
                    <button 
                      onClick={() => setExpandedCheckId(isExpanded ? null : check.id)}
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between mb-4 pb-4 border-b border-dashed border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-all duration-300 group-hover:scale-110 group-active:scale-95 ${
                            isDarkMode 
                              ? 'bg-amber-950/40 text-amber-500 border border-amber-800/30' 
                              : 'bg-amber-50 text-amber-500 border border-amber-100'
                          } ${!isExpanded && check.status === 'PENDING' ? 'animate-pulse ring-4 ring-amber-500/20' : ''}`}>
                            <Hash size={18} strokeWidth={3} />
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Nº do Cheque</p>
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{check.number}</p>
                              {isLate && <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest leading-none mb-1">Valor</p>
                          <p className="text-sm font-black tracking-tight text-indigo-600 dark:text-indigo-400">R$ {check.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-y-4">
                        <div className="flex items-center gap-3">
                          <Calendar size={14} className="text-slate-300 dark:text-slate-600" />
                          <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Bom Para</p>
                            <p className={`text-[10px] font-bold uppercase ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>{format(check.dueDate, 'dd/MM/yyyy')}</p>
                            {check.status === 'PENDING' && (
                              <p className={`text-[8px] font-bold mt-0.5 uppercase ${isLate ? 'text-rose-500' : isToday ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`}>
                                {isLate ? `${Math.abs(daysUntil)} dias vencidos` : isToday ? 'Vence hoje' : `Faltam ${daysUntil} dias`}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <AlertCircle size={14} className="text-slate-300 dark:text-slate-600" />
                          <div>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Status</p>
                            <p className={`text-[10px] font-bold uppercase ${statusMap[check.status]?.color || 'text-slate-600'}`}>
                              {statusMap[check.status]?.label || check.status}
                            </p>
                          </div>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="mt-6 pt-6 border-t border-dashed border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-top-4 duration-500">
                         <div className="mb-4 bg-white dark:bg-slate-950/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <div className="flex items-center justify-between mb-3">
                               <div className="flex items-center gap-2">
                                  <User size={12} className="text-slate-400" />
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fornecedor</p>
                               </div>
                               <p className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight">{check.supplierName}</p>
                            </div>
                            <div className="flex items-center justify-between">
                               <div className="flex items-center gap-2">
                                  <Landmark size={12} className="text-slate-400" />
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Empresa</p>
                               </div>
                               <p className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tight leading-none">Vendas Pro</p>
                            </div>
                         </div>

                         <div className="flex gap-2">
                            {check.status !== 'CLEARED' ? (
                              <>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCheckStatusChange(check.purchaseId, check.id, "CLEARED");
                                  }}
                                  className="flex-1 py-3 rounded-2xl bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                  <CheckCircle2 size={16} strokeWidth={3} />
                                  Liquidar
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCheckStatusChange(check.purchaseId, check.id, "OVERDUE");
                                  }}
                                  className={`flex-1 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-2 active:scale-95 ${check.status === 'OVERDUE' ? 'bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-500/20' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400'}`}
                                >
                                  <AlertCircle size={16} />
                                  Vencido
                                </button>
                              </>
                            ) : (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCheckStatusChange(check.purchaseId, check.id, "PENDING");
                                }}
                                className="w-full py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest border border-amber-100 dark:border-amber-900/50 active:scale-95 transition-all flex items-center justify-center gap-3"
                              >
                                <RefreshCcw size={16} strokeWidth={3} />
                                Reverter Liquidação
                              </button>
                            )}
                         </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-12 bg-slate-50/50 dark:bg-slate-950/50 rounded-3xl border-2 border-dashed border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center gap-3">
                 <Filter className="text-slate-200 dark:text-slate-800" size={32} strokeWidth={1.5} />
                 <p className="text-[10px] font-black uppercase text-slate-300 dark:text-slate-700 tracking-[0.2em] italic">Nenhum cheque encontrado</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Recent Activity */}

      {/* Recent Activity */}
      <section>
        <button 
          onClick={() => setIsRecentActivityExpanded(!isRecentActivityExpanded)}
          className="flex items-center justify-between w-full mb-4 px-1"
        >
          <div>
            <h2
              className={`text-[13px] font-black uppercase tracking-tight ${isDarkMode ? "text-white" : "text-slate-800"}`}
            >
              Atividade
            </h2>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest leading-none">
              Recentes
            </p>
          </div>
          <div className={`p-2 rounded-full ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'} text-slate-500`}>
            {isRecentActivityExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>

        {isRecentActivityExpanded && (
          <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
            {recentActivity.map((activity: any) => (
              <div
                key={activity.id}
                className={`flex items-center gap-4 p-3 border rounded-2xl shadow-sm dark:shadow-none hover:border-slate-200 dark:hover:border-slate-700 transition-colors ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}
              >
                <div
                  className={`flex items-center justify-center p-2 rounded-xl ${
                    activity.activityType === "sale" 
                      ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30" 
                      : activity.activityType === "purchase"
                        ? "bg-slate-50 text-slate-400 dark:bg-slate-800"
                        : (activity.type === TransactionType.INCOME)
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30"
                          : "bg-rose-50 text-rose-600 dark:bg-rose-900/30"
                  }`}
                >
                  {activity.activityType === "sale" ? (
                    <ShoppingBag size={20} strokeWidth={2.5} />
                  ) : activity.activityType === "purchase" ? (
                    <TrendingDown size={20} strokeWidth={2.5} />
                  ) : activity.type === TransactionType.INCOME ? (
                    <TrendingUp size={20} strokeWidth={2.5} />
                  ) : (
                    <TrendingDown size={20} strokeWidth={2.5} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[12px] font-black truncate uppercase tracking-tight leading-none ${isDarkMode ? "text-white" : "text-slate-800"}`}
                  >
                    {activity.activityType === "sale"
                      ? "Venda"
                      : activity.activityType === "purchase"
                        ? "Compra"
                        : activity.description || "Lançamento"}
                  </p>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-1.5 ">
                    {format(activity.date, "dd MMM, HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-[13px] font-black tracking-tight ${
                      activity.activityType === "sale" || (activity.activityType === "transaction" && activity.type === TransactionType.INCOME)
                        ? "text-emerald-500" 
                        : "text-rose-500"
                    }`}
                  >
                    {(activity.activityType === "sale" || (activity.activityType === "transaction" && activity.type === TransactionType.INCOME)) ? "+" : "-"} 
                    R$ {Number(activity.total || activity.amount).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                  </p>
                  <div className="flex items-center gap-1 justify-end mt-1">
                    <span
                      className={`text-[7px] px-1.5 py-0.5 rounded-lg uppercase font-black tracking-widest ${
                        (activity.status === 'PENDING' || activity.activityStatus === 'PENDING')
                          ? "bg-amber-100 text-amber-600"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                      }`}
                    >
                      {(activity.status === 'PENDING' || activity.activityStatus === 'PENDING') ? "Pendente" : "OK"}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {recentActivity.length === 0 && (
              <div className="text-center py-20 bg-slate-50/50 dark:bg-slate-900/50 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-[2.5rem] flex flex-col items-center">
                <History
                  size={40}
                  className="text-slate-200 dark:text-slate-800 mb-2"
                  strokeWidth={1}
                />
                <p className="text-[10px] font-black uppercase text-slate-300 dark:text-slate-700 tracking-[0.2em] italic">
                  Vazio histórico
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
