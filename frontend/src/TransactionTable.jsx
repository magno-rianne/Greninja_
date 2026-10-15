import { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { Table, Badge, Button, Paper, Title, Text, Group, Loader, Center, TextInput, Select, SimpleGrid, Autocomplete, Modal, Card, ThemeIcon, ActionIcon, ScrollArea, useMantineColorScheme } from '@mantine/core';
import { IconSearch, IconArrowDownRight, IconArrowUpRight, IconWallet, IconX } from '@tabler/icons-react';
import { renderStatusAlert } from './alertUtils';

const formatLongDate = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  const dateObj = new Date(year, month - 1, day);
  return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const getMonthName = (dateString) => {
  if (!dateString) return '';
  const monthIndex = parseInt(dateString.split('-')[1], 10) - 1;
  const dateObj = new Date(2000, monthIndex, 1);
  return dateObj.toLocaleDateString('en-US', { month: 'long' });
};

export default function TransactionTable({ userId }) {
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [deletingHash, setDeletingHash] = useState(null);
  const [savingHash, setSavingHash] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [confirmDeleteHash, setConfirmDeleteHash] = useState(null);

  const [editingHash, setEditingHash] = useState(null);
  const [editValues, setEditValues] = useState({ description: '', category: '' });

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [monthFilter, setMonthFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState('desc'); 

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId);

      if (error) console.error("Error fetching data:", error);
      if (data) setTransactions(data);
      setLoading(false);
    };
    fetchData();
  }, [userId]);

  const handleDeleteClick = (hash) => {
    setActionError(null);
    setConfirmDeleteHash(hash);
  };

  const handleConfirmDelete = async () => {
    const hash = confirmDeleteHash;
    setDeletingHash(hash);
    const { error } = await supabase.from('transactions').delete().eq('transaction_hash', hash);
    if (error) {
      setActionError(`Failed to delete this transaction: ${error.message}`);
    } else {
      setTransactions(transactions.filter(t => t.transaction_hash !== hash));
      setConfirmDeleteHash(null);
    }
    setDeletingHash(null);
  };

  const handleEditClick = (transaction) => {
    setEditingHash(transaction.transaction_hash);
    setEditValues({ description: transaction.description, category: transaction.category });
  };

  const handleCancelEdit = () => {
    setEditingHash(null);
    setEditValues({ description: '', category: '' });
  };

  const handleSaveEdit = async (hash) => {
    setSavingHash(hash);
    setActionError(null);
    const { error } = await supabase
      .from('transactions')
      .update({ description: editValues.description, category: editValues.category })
      .eq('transaction_hash', hash);

    if (error) {
      setActionError(`Failed to update this transaction: ${error.message}`);
    } else {
      setTransactions(transactions.map(t => 
        t.transaction_hash === hash ? { ...t, description: editValues.description, category: editValues.category } : t
      ));
      setEditingHash(null);
    }
    setSavingHash(null);
  };

  const actualCategories = useMemo(() => [...new Set(transactions.map(t => t.category))].sort(), [transactions]);
  const categoryOptions = useMemo(() => ['All', ...actualCategories], [actualCategories]);
  const yearOptions = useMemo(() => ['All', ...[...new Set(transactions.map(t => t.date.substring(0, 4)))].sort((a, b) => b.localeCompare(a))], [transactions]);
  const monthOptions = useMemo(() => {
    const uniqueMonths = [...new Set(transactions.map(t => getMonthName(t.date)))];
    const allMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return ['All', ...allMonths.filter(m => uniqueMonths.includes(m))];
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const filtered = transactions.filter((t) => {
      const matchesCategory = categoryFilter === 'All' || t.category === categoryFilter;
      const matchesYear = yearFilter === 'All' || t.date.startsWith(yearFilter);
      const matchesMonth = monthFilter === 'All' || getMonthName(t.date) === monthFilter;
      const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase()) || t.amount.toString().includes(searchTerm);
      return matchesCategory && matchesYear && matchesMonth && matchesSearch;
    });
    return filtered.sort((a, b) => sortOrder === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  }, [transactions, searchTerm, categoryFilter, monthFilter, yearFilter, sortOrder]);

  const filteredTotals = useMemo(() => {
    let income = 0, expenses = 0;
    filteredTransactions.forEach(t => {
      const amount = Number(t.amount); 
      if (!isNaN(amount)) {
        if (amount > 0) income += amount;
        else expenses += Math.abs(amount);
      }
    });
    return { income, expenses, net: income - expenses };
  }, [filteredTransactions]);

  if (loading) {
    return (
      <Paper withBorder p="xl" radius="md" h="calc(100vh - 32px)">
        <Title order={3} mb="xs" c="var(--mantine-color-text)">Transaction History</Title>
        <Text c="var(--mantine-color-dimmed)" size="sm" mb="xl">Review and manage all processed records.</Text>
        <Center h={200}><Loader color="greninja" /></Center>
      </Paper>
    );
  }

  const rows = filteredTransactions.map((t) => {
    const isEditing = editingHash === t.transaction_hash;
    const isPositive = Number(t.amount) > 0;

    return (
      <Table.Tr key={t.transaction_hash}>
        <Table.Td c="var(--mantine-color-text)">{formatLongDate(t.date)}</Table.Td>
        <Table.Td fw={500} c="var(--mantine-color-text)">
          {isEditing ? (
            <TextInput size="xs" value={editValues.description} onChange={(e) => setEditValues({ ...editValues, description: e.currentTarget.value })} />
          ) : t.description}
        </Table.Td>
        <Table.Td>
          {isEditing ? (
            <Autocomplete size="xs" data={actualCategories} value={editValues.category} onChange={(val) => setEditValues({ ...editValues, category: val })} placeholder="Select or type..." />
          ) : (
            <Badge variant="light" color="blue">{t.category}</Badge>
          )}
        </Table.Td>
        
        <Table.Td ta="right" fw={600} c={isPositive ? 'teal.5' : 'red.5'}>
          {isPositive ? '+' : ''}₱{Number(t.amount).toFixed(2)}
        </Table.Td>
        
        <Table.Td ta="center">
          {isEditing ? (
            <Group gap="xs" justify="center" wrap="nowrap">
              <Button variant="light" color="greninja" size="xs" loading={savingHash === t.transaction_hash} onClick={() => handleSaveEdit(t.transaction_hash)}>Save</Button>
              <Button variant="subtle" color="gray" size="xs" disabled={savingHash === t.transaction_hash} onClick={handleCancelEdit}>Cancel</Button>
            </Group>
          ) : (
            <Group gap="xs" justify="center" wrap="nowrap">
              <Button variant="subtle" color="greninja" size="xs" onClick={() => handleEditClick(t)}>Edit</Button>
              <Button variant="subtle" color="red" size="xs" loading={deletingHash === t.transaction_hash} onClick={() => handleDeleteClick(t.transaction_hash)}>Delete</Button>
            </Group>
          )}
        </Table.Td>
      </Table.Tr>
    );
  });

  const summaryCards = [
    { label: 'Total In', value: filteredTotals.income, color: 'teal', icon: IconArrowDownRight },
    { label: 'Total Out', value: filteredTotals.expenses, color: 'red', icon: IconArrowUpRight },
    { label: 'Net', value: filteredTotals.net, color: filteredTotals.net >= 0 ? 'greninja' : 'red', icon: IconWallet },
  ];

  return (
    <Paper withBorder p="xl" radius="md" h="calc(100vh - 32px)" display="flex" style={{ flexDirection: 'column' }}>
      <Group justify="space-between" align="flex-end" mb="xl" wrap="wrap" gap="md">
        <div>
          <Title order={3} mb="xs" c="var(--mantine-color-text)">Transaction History</Title>
          <Text c="var(--mantine-color-dimmed)" size="sm">Review and manage all processed records.</Text>
        </div>
        <TextInput
          placeholder="Search by merchant or amount..."
          leftSection={<IconSearch size={16} />}
          rightSection={
            searchTerm ? (
              <ActionIcon variant="subtle" color="gray" radius="xl" size="sm" onClick={() => setSearchTerm('')}>
                <IconX size={14} />
              </ActionIcon>
            ) : null
          }
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.currentTarget.value)}
          size="md"
          radius="xl"
          variant="filled"
          w={{ base: '100%', sm: 340 }}
          styles={{
            input: {
              transition: 'box-shadow 150ms ease, border-color 150ms ease',
            },
          }}
        />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="xl">
        {summaryCards.map((card) => (
          <Card key={card.label} withBorder radius="md" p="lg">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text tt="uppercase" fw={700} size="xs" c="var(--mantine-color-dimmed)" style={{ letterSpacing: '0.4px' }}>{card.label}</Text>
                <Title order={4} mt={4} c="var(--mantine-color-text)">
                  {card.value < 0 ? '-' : ''}₱{Math.abs(card.value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Title>
              </div>
              <ThemeIcon color={card.color} variant="light" size={34} radius="md">
                <card.icon size={18} stroke={1.75} />
              </ThemeIcon>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      {renderStatusAlert('error', actionError)}

      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="md" align="flex-end">
        <Select label={<Text c="var(--mantine-color-text)" size="sm" fw={500}>Filter by Category</Text>} value={categoryFilter} onChange={setCategoryFilter} data={categoryOptions} />
        <Select label={<Text c="var(--mantine-color-text)" size="sm" fw={500}>Filter by Month</Text>} value={monthFilter} onChange={setMonthFilter} data={monthOptions} />
        <Select label={<Text c="var(--mantine-color-text)" size="sm" fw={500}>Filter by Year</Text>} value={yearFilter} onChange={setYearFilter} data={yearOptions} />
      </SimpleGrid>

      <Text size="sm" c="var(--mantine-color-dimmed)" mb="sm">Showing {filteredTransactions.length} transactions</Text>

      <ScrollArea flex={1} type="auto" style={{ minHeight: 0 }}>
        <Table verticalSpacing="sm" highlightOnHover highlightOnHoverColor={isDark ? 'rgba(56, 108, 196, 0.15)' : '#eaf2fb'} style={{ minWidth: 700 }}>
          <Table.Thead>
            <Table.Tr style={{ verticalAlign: 'bottom' }}>
              <Table.Th w={180} pb={8}>
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={700} size="sm" c="var(--mantine-color-text)">Date</Text>
                  <Button variant="subtle" size="compact-xs" color="gray" onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}>
                    {sortOrder === 'desc' ? '↓ Newest' : '↑ Oldest'}
                  </Button>
                </Group>
              </Table.Th>
              <Table.Th pb={8}><Text fw={700} size="sm" c="var(--mantine-color-text)">Description</Text></Table.Th>
              <Table.Th w={180} pb={8}><Text fw={700} size="sm" c="var(--mantine-color-text)">Category</Text></Table.Th>
              <Table.Th ta="right" w={120} pb={8}><Text fw={700} size="sm" c="var(--mantine-color-text)">Amount</Text></Table.Th>
              <Table.Th ta="center" w={160} pb={8}><Text fw={700} size="sm" c="var(--mantine-color-text)">Action</Text></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length > 0 ? rows : (
              <Table.Tr><Table.Td colSpan={5} ta="center" py="xl" c="var(--mantine-color-dimmed)">No transactions found matching your filters.</Table.Td></Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Modal
        opened={confirmDeleteHash !== null}
        onClose={() => !deletingHash && setConfirmDeleteHash(null)}
        title={<Text fw={600} c="var(--mantine-color-text)">Delete Transaction</Text>}
        centered
        closeOnClickOutside={!deletingHash}
        withCloseButton={!deletingHash}
      >
        <Text size="sm" mb="md" c="var(--mantine-color-text)">
          Are you sure you want to delete this transaction? This action cannot be undone.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setConfirmDeleteHash(null)} disabled={!!deletingHash}>Cancel</Button>
          <Button color="red" onClick={handleConfirmDelete} loading={!!deletingHash}>Yes, Delete</Button>
        </Group>
      </Modal>
    </Paper>
  );
}