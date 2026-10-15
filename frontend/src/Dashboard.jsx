import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import ReactEChartsCore from 'echarts-for-react/esm/core.js';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  LegendScrollComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { Paper, Title, Text, Group, Loader, Center, Grid, Card, Badge, ThemeIcon, Stack, ScrollArea, useMantineColorScheme } from '@mantine/core';
import { IconTrendingUp, IconTrendingDown, IconPigMoney, IconReceipt2 } from '@tabler/icons-react';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  LegendScrollComponent,
  TooltipComponent,
  CanvasRenderer,
]);

const formatChartDate = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  const dateObj = new Date(year, month - 1, day);
  return `${dateObj.toLocaleDateString('en-US', { month: 'long' })} ${parseInt(day, 10)} ${year}`; 
};

function PageHeader({ monthName }) {
  return (
    <>
      <Title order={3} mb="xs" c="var(--mantine-color-text)">Dashboard</Title>
      <Group gap="xs" mb="xl">
        <Text c="var(--mantine-color-dimmed)" size="sm">
          An overview of your income, spending, and cash flow.
        </Text>
        {monthName && (
          <Badge color="greninja" variant="light" size="sm" radius="sm">
            Showing {monthName}
          </Badge>
        )}
      </Group>
    </>
  );
}

export default function Dashboard({ userId }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';
  
  const chartTextColor = isDark ? '#C1C2C5' : '#495057';
  const tooltipBg = isDark ? '#25262B' : '#FFFFFF';
  const tooltipBorder = isDark ? '#373A40' : '#E9ECEF';
  const gridLineColor = isDark ? '#373A40' : '#f1f5f9';

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: true }); 
      if (error) console.error("Error fetching data:", error);
      if (data) setTransactions(data);
      setLoading(false);
    };
    fetchData();
  }, [userId]);

  const { pieData, uniqueDates, balanceData, latestMonthStats, merchantNames, merchantValues } = useMemo(() => {
    const categoryTotals = {}, merchantTotals = {}, monthlyStats = {}; 
    const allMonths = [...new Set(transactions.map(t => t.date.substring(0, 7)))].sort();
    const latestMonthKey = allMonths.length > 0 ? allMonths[allMonths.length - 1] : null;

    transactions.forEach((t) => {
      const amount = Number(t.amount);
      if (isNaN(amount)) return;
      const monthKey = t.date.substring(0, 7);
      if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { income: 0, expenses: 0, totalIn: 0, totalOut: 0, txnCount: 0 };
      monthlyStats[monthKey].txnCount += 1;

      const isNonSpending = t.category === 'Self Transfer' || t.category === 'Load/Data';

      if (amount > 0) {
        monthlyStats[monthKey].totalIn += amount;
        if (!isNonSpending) {
          monthlyStats[monthKey].income += amount;
        }
      } else {
        const absAmount = Math.abs(amount);
        monthlyStats[monthKey].totalOut += absAmount;
        if (!isNonSpending) {
          monthlyStats[monthKey].expenses += absAmount;
          if (monthKey === latestMonthKey) {
            categoryTotals[t.category] = (categoryTotals[t.category] || 0) + absAmount;
            merchantTotals[t.description] = (merchantTotals[t.description] || 0) + absAmount;
          }
        }
      }
    });

    const formattedPieData = Object.keys(categoryTotals).map(key => ({ name: key, value: categoryTotals[key].toFixed(2) })).sort((a, b) => b.value - a.value);
    const topMerchants = Object.entries(merchantTotals).map(([name, total]) => ({ name, value: total })).sort((a, b) => b.value - a.value).slice(0, 5); 
    const dates = [...new Set(transactions.map(t => t.date))];
    let runningBalance = 0;
    const balances = dates.map(date => {
      const dayNet = transactions.filter(t => t.date === date).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      runningBalance += dayNet;
      return runningBalance.toFixed(2);
    });

    let stats = { name: 'This Month', income: 0, expenses: 0, txnCount: 0, netSavings: 0, savingsRate: 0, incomeTrend: 0, expenseTrend: 0, hasPrevious: false };
    if (latestMonthKey) {
      const currentData = monthlyStats[latestMonthKey];
      const [yyyy, mm] = latestMonthKey.split('-');
      stats.name = new Date(parseInt(yyyy), parseInt(mm) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      stats.income = currentData.income;
      stats.expenses = currentData.expenses;
      stats.txnCount = currentData.txnCount;
      stats.netSavings = currentData.totalIn - currentData.totalOut;
      stats.savingsRate = currentData.totalIn > 0 ? (stats.netSavings / currentData.totalIn) * 100 : 0;
      if (allMonths.length > 1) {
        const prevData = monthlyStats[allMonths[allMonths.length - 2]];
        stats.hasPrevious = true;
        stats.incomeTrend = prevData.income === 0 ? 100 : ((currentData.income - prevData.income) / prevData.income) * 100;
        stats.expenseTrend = prevData.expenses === 0 ? 100 : ((currentData.expenses - prevData.expenses) / prevData.expenses) * 100;
      }
    }
    return { pieData: formattedPieData, uniqueDates: dates, balanceData: balances, latestMonthStats: stats, merchantNames: topMerchants.map(m => m.name), merchantValues: topMerchants.map(m => m.value.toFixed(2)) };
  }, [transactions]);

  const categoryOptions = {
    tooltip: { trigger: 'item', formatter: '<b>{b}</b><br/>₱{c} ({d}%)', backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: chartTextColor } },
    legend: { type: 'scroll', orient: 'horizontal', bottom: 0, textStyle: { color: chartTextColor } },
    color: ['#194c81', '#386cc4', '#84a6d7', '#ede8b1', '#facc15', '#f43f5e'],
    series: [{
      name: 'Expenses', type: 'pie', radius: '70%', center: ['50%', '48%'], avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: tooltipBg, borderWidth: 3 },
      label: { show: true, position: 'outside', color: chartTextColor, formatter: '{b}\n{d}%', fontSize: 12 },
      emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold', color: chartTextColor } },
      labelLine: { show: true, lineStyle: { color: gridLineColor } }, data: pieData,
    }]
  };

  const merchantOptions = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'none' }, backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: chartTextColor }, formatter: (params) => `<b>${params[0].name}</b><br/>₱${Number(params[0].value).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    grid: { left: '3%', right: '12%', top: '5%', bottom: '5%', containLabel: true },
    xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: 'category', data: merchantNames, inverse: true, axisLabel: { color: chartTextColor, width: 120, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      name: 'Spent', type: 'bar', data: merchantValues, barWidth: '50%',
      itemStyle: { borderRadius: [0, 4, 4, 0], color: '#194c81' },
      emphasis: { itemStyle: { color: '#194c81' } },
      label: { show: true, position: 'right', color: chartTextColor, formatter: (params) => `₱${Number(params.value).toLocaleString()}` }
    }]
  };

  const balanceOptions = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross', label: { backgroundColor: '#194c81' } }, backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: chartTextColor }, formatter: (params) => `<b>${formatChartDate(params[0].name)}</b><br/>Balance: ₱${Number(params[0].value).toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
    grid: { left: '2%', right: '3%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: uniqueDates, axisLine: { lineStyle: { color: gridLineColor } }, axisLabel: { color: chartTextColor, formatter: (value) => formatChartDate(value) } },
    yAxis: { type: 'value', axisLabel: { color: chartTextColor, formatter: (value) => `₱${value.toLocaleString()}` }, splitLine: { lineStyle: { type: 'dashed', color: gridLineColor } } },
    series: [{ 
      data: balanceData, type: 'line', smooth: 0.4, symbol: 'circle', symbolSize: 6, 
      itemStyle: { color: '#194c81' }, 
      lineStyle: { width: 3, shadowColor: 'rgba(25, 76, 129, 0.3)', shadowBlur: 10 }, 
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(25, 76, 129, 0.4)' }, { offset: 1, color: 'rgba(25, 76, 129, 0.01)' }]) } 
    }]
  };

  if (loading) {
    return (
      <Paper withBorder p="xl" radius="md" h="calc(100vh - 32px)">
        <PageHeader monthName={latestMonthStats?.name} />
        <Center h={300}><Loader color="greninja" size="lg" type="bars" /></Center>
      </Paper>
    );
  }

  if (transactions.length === 0) {
    return (
      <Paper withBorder p="xl" radius="md" h="calc(100vh - 32px)">
        <PageHeader monthName={latestMonthStats?.name} />
        <Center py="xl" ta="center">
          <div>
            <Title order={4} mb="xs" c="var(--mantine-color-text)">No transactions yet</Title>
            <Text c="var(--mantine-color-dimmed)">Upload your MariBank statement to generate your dashboard.</Text>
          </div>
        </Center>
      </Paper>
    );
  }

  const isIncomeUp = latestMonthStats.incomeTrend >= 0;
  const isExpenseUp = latestMonthStats.expenseTrend > 0;
  const isSavingsPositive = latestMonthStats.netSavings >= 0;

  const kpiCards = [
    {
      label: 'Income',
      value: `₱${latestMonthStats.income.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      color: 'teal',
      icon: IconTrendingUp,
      trend: latestMonthStats.hasPrevious ? { up: isIncomeUp, value: latestMonthStats.incomeTrend } : null,
    },
    {
      label: 'Expenses',
      value: `₱${latestMonthStats.expenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      color: 'red',
      icon: IconTrendingDown,
      trend: latestMonthStats.hasPrevious ? { up: isExpenseUp, value: latestMonthStats.expenseTrend, invertGood: true } : null,
    },
    {
      label: 'Net Cash Flow',
      value: `${latestMonthStats.netSavings < 0 ? '-' : ''}₱${Math.abs(latestMonthStats.netSavings).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      color: isSavingsPositive ? 'greninja' : 'red',
      icon: IconPigMoney,
      subtext: `${latestMonthStats.savingsRate.toFixed(1)}% of money in kept`,
    },
    {
      label: 'Transactions',
      value: latestMonthStats.txnCount.toLocaleString(),
      color: 'gray',
      icon: IconReceipt2,
      subtext: 'Total recorded this month',
    },
  ];

  return (
    <Paper withBorder p="xl" radius="md" h="calc(100vh - 32px)" display="flex" style={{ flexDirection: 'column' }}>
      <div><PageHeader monthName={latestMonthStats?.name} /></div>
      <ScrollArea flex={1} type="auto" style={{ minHeight: 0 }} pr="md">
        <Stack gap="lg">
          <Grid>
            {kpiCards.map((kpi) => (
              <Grid.Col key={kpi.label} span={{ base: 12, sm: 6, lg: 3 }}>
                <Card radius="md" p="lg">
                  <Group justify="space-between" align="flex-start" mb="sm">
                    <Text tt="uppercase" fw={700} size="xs" c="var(--mantine-color-dimmed)" style={{ letterSpacing: '0.4px' }}>
                      {kpi.label}
                    </Text>
                    <ThemeIcon color={kpi.color} variant="light" size={34} radius="md">
                      <kpi.icon size={18} stroke={1.75} />
                    </ThemeIcon>
                  </Group>
                  <Title order={3} c="var(--mantine-color-text)">{kpi.value}</Title>
                  {kpi.trend && (
                    <Group gap="xs" mt="md">
                      <Badge
                        color={kpi.trend.invertGood ? (kpi.trend.up ? 'red' : 'teal') : (kpi.trend.up ? 'teal' : 'red')}
                        variant="light"
                        size="sm"
                      >
                        {kpi.trend.up ? '↑' : '↓'} {Math.abs(kpi.trend.value).toFixed(1)}%
                      </Badge>
                      <Text size="xs" c="var(--mantine-color-dimmed)">vs previous month</Text>
                    </Group>
                  )}
                  {kpi.subtext && (
                    <Text size="xs" c="var(--mantine-color-dimmed)" mt="md">{kpi.subtext}</Text>
                  )}
                </Card>
              </Grid.Col>
            ))}
          </Grid>
          <Grid>
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <Card radius="md" p="lg">
                <Title order={4} ta="center" mb="xl" c="var(--mantine-color-text)">Where Your Money Went</Title>
                <ReactEChartsCore echarts={echarts} option={categoryOptions} style={{ height: '350px' }} />
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <Card radius="md" p="lg">
                <Title order={4} ta="center" mb="xl" c="var(--mantine-color-text)">Top 5 Merchants</Title>
                <ReactEChartsCore echarts={echarts} option={merchantOptions} style={{ height: '350px' }} />
              </Card>
            </Grid.Col>
          </Grid>
          <Grid>
            <Grid.Col span={12}>
              <Card radius="md" p="lg">
                <Title order={4} ta="center" mb="xl" c="var(--mantine-color-text)">All-Time Cash Flow & Balance</Title>
                <ReactEChartsCore echarts={echarts} option={balanceOptions} style={{ height: '350px' }} />
              </Card>
            </Grid.Col>
          </Grid>
        </Stack>
      </ScrollArea>
    </Paper>
  );
}