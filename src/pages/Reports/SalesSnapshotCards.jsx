import {
  BadgeDollarSign, CirclePause, CreditCard, Globe2, Percent, Receipt, Tag,
  TrendingUp, Wallet,
} from 'lucide-react';
import { fmt, StatCard } from './ReportShared';

const SalesSnapshotCards = ({
  loading = false,
  grossSales = 0,
  netSales = 0,
  collected = 0,
  salesTax = 0,
  discounts = 0,
  orders = 0,
  averageOrder = 0,
  cashSales = 0,
  cardSales = 0,
  onlineSales = 0,
  heldTotal = 0,
  heldCount = 0,
  className = '',
}) => {
  const cashPercentage = Number(collected) > 0
    ? (Number(cashSales) / Number(collected)) * 100
    : 0;

  return (
    <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-7 ${className}`}>
      {loading ? (
        Array.from({ length: 11 }).map((_, index) => (
          <div key={index} className="h-[76px] animate-pulse rounded-2xl bg-gray-100" />
        ))
      ) : (
        <>
          <StatCard compact label="Gross Sales" value={`Rs. ${fmt(grossSales)}`} sub="Before discounts" icon={BadgeDollarSign} color="violet" />
          <StatCard compact label="Net Sales" value={`Rs. ${fmt(netSales)}`} sub="After discounts" icon={TrendingUp} color="emerald" />
          <StatCard compact highlight label="Collected" value={`Rs. ${fmt(collected)}`} sub="Payments received" icon={Wallet} color="indigo" />
          <StatCard compact label="Sales Tax" value={`Rs. ${fmt(salesTax)}`} sub="Tax collected" icon={Percent} color="rose" />
          <StatCard compact label="Discounts" value={`Rs. ${fmt(discounts)}`} sub="Incl. rewards" icon={Tag} color="rose" />
          <StatCard compact label="Orders" value={orders} sub="Paid / refunded" icon={Receipt} color="emerald" />
          <StatCard compact label="Avg. Order" value={`Rs. ${fmt(averageOrder)}`} sub="Collected per order" icon={TrendingUp} color="cyan" />
          <StatCard compact label="Cash Sales" value={`Rs. ${fmt(cashSales)}`} sub={`${cashPercentage.toFixed(0)}% of collected`} icon={Wallet} color="emerald" />
          <StatCard compact label="Card Sales" value={`Rs. ${fmt(cardSales)}`} sub="Card collections" icon={CreditCard} color="cyan" />
          <StatCard compact label="Online Sales" value={`Rs. ${fmt(onlineSales)}`} sub="Bank / wallets" icon={Globe2} color="blue" />
          <StatCard compact label="Held Orders" value={`Rs. ${fmt(heldTotal)}`} sub={`${heldCount} awaiting payment`} icon={CirclePause} color="amber" />
        </>
      )}
    </div>
  );
};

export default SalesSnapshotCards;
