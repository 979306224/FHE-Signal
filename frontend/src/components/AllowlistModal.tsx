import { Button, Modal, Typography, Divider, Spin, Toast, Table, Space, Tag, Input, Card, Steps } from '@douyinfe/semi-ui';
import { IconPlus, IconDelete, IconRefresh, IconUser, IconEdit, IconCheckCircleStroked } from '@douyinfe/semi-icons';
import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { ContractService } from '../services';
import type { AllowlistEntry, BatchAllowlistParams, BatchRemoveParams } from '../types/contracts';
import './AllowlistModal.less';

const { Title, Text } = Typography;

export interface AllowlistModalProps {
    channelId: bigint;
    visible: boolean;
    onClose: () => void;
}

// Table data structure
interface UserEntry {
    id: string;
    address: string;
    weight: string;
    addressError?: string;
    weightError?: string;
}

export default function AllowlistModal({ channelId, visible, onClose }: AllowlistModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(10);

    // Add user related state
    const [showAddForm, setShowAddForm] = useState(false);
    const [addingUsers, setAddingUsers] = useState(false);
    const [addStep, setAddStep] = useState(0); // 0: input, 1: preview, 2: confirm

    // Debug: listen to showAddForm state changes
    useEffect(() => {
        console.log('showAddForm state change:', showAddForm);
    }, [showAddForm]);

    // Table data structure
    const [tableData, setTableData] = useState<UserEntry[]>([
        { id: '1', address: '', weight: '1' }
    ]);
    const [previewData, setPreviewData] = useState<{users: string[], weights: bigint[]}>();

    // Remove user related state
    const [removingUsers, setRemovingUsers] = useState<Set<string>>(new Set());

    const { address: userAddress, isConnected } = useAccount();

    // Load allowlist data
    const loadAllowlist = useCallback(async (page: number = 1) => {
        try {
            setLoading(true);
            setError(null);

            const offset = (page - 1) * pageSize;
            const result = await ContractService.getAllowlistPaginated(channelId, offset, pageSize);

            setAllowlist(result.items);
            setTotalCount(Number(result.total));
            setCurrentPage(page);

            console.log('Allowlist loaded:', result);
        } catch (err) {
            console.error('Failed to load allowlist:', err);
            setError('Failed to load allowlist, please try again');
        } finally {
            setLoading(false);
        }
    }, [channelId, pageSize]);

    // Initial load
    useEffect(() => {
        if (visible) {
            loadAllowlist(1);
        }
    }, [visible, loadAllowlist]);

    // Validate single address
    const validateAddress = (address: string): string | undefined => {
        if (!address.trim()) return 'Please enter address';
        const addressRegex = /^0x[a-fA-F0-9]{40}$/;
        if (!addressRegex.test(address)) {
            return 'Invalid address format (must be 0x followed by 40 hexadecimal characters)';
        }
        return undefined;
    };

    // Validate single weight
    const validateWeight = (weight: string): string | undefined => {
        if (!weight.trim()) return 'Please enter weight';
        const num = parseInt(weight);
        if (isNaN(num) || num <= 0) {
            return 'Weight must be an integer greater than 0';
        }
        return undefined;
    };

    // Update table data
    const updateTableEntry = (id: string, field: 'address' | 'weight', value: string) => {
        setTableData(prev => prev.map(item => {
            if (item.id === id) {
                const updated = { ...item, [field]: value };
                // Real-time validation
                if (field === 'address') {
                    updated.addressError = validateAddress(value);
                } else if (field === 'weight') {
                    updated.weightError = validateWeight(value);
                }
                return updated;
            }
            return item;
        }));
    };

    // Add new row
    const addNewRow = () => {
        const newId = Date.now().toString();
        setTableData(prev => [...prev, { id: newId, address: '', weight: '1' }]);
    };

    // Delete row
    const deleteRow = (id: string) => {
        setTableData(prev => prev.filter(item => item.id !== id));
    };

    // Validate all data
    const validateAllData = (): { valid: boolean; errors: string[]; validEntries: UserEntry[] } => {
        const errors: string[] = [];
        const validEntries: UserEntry[] = [];

        // Filter empty rows
        const nonEmptyEntries = tableData.filter(item => item.address.trim() || item.weight.trim());

        if (nonEmptyEntries.length === 0) {
            errors.push('Please add at least one user');
            return { valid: false, errors, validEntries };
        }

        // Check each row
        nonEmptyEntries.forEach((item, index) => {
            const addressError = validateAddress(item.address);
            const weightError = validateWeight(item.weight);

            if (addressError) {
                errors.push(`Row ${index + 1} address: ${addressError}`);
            }
            if (weightError) {
                errors.push(`Row ${index + 1} weight: ${weightError}`);
            }

            if (!addressError && !weightError) {
                validEntries.push(item);
            }
        });

        // Check for duplicate addresses
        const addresses = validEntries.map(item => item.address.toLowerCase());
        const duplicates = addresses.filter((addr, index) => addresses.indexOf(addr) !== index);
        if (duplicates.length > 0) {
            errors.push(`Found duplicate addresses: ${[...new Set(duplicates)].join(', ')}`);
        }

        return {
            valid: errors.length === 0,
            errors,
            validEntries
        };
    };

    // Handle form submission
    const handleFormSubmit = useCallback(async () => {
        const validation = validateAllData();

        if (!validation.valid) {
            Toast.error(validation.errors.join('\n'));
            return;
        }

        // Set preview data and enter preview step
        setPreviewData({
            users: validation.validEntries.map(item => item.address),
            weights: validation.validEntries.map(item => BigInt(item.weight))
        });
        setAddStep(1);
    }, [tableData]);

    // Handle add user confirmation
    const handleConfirmAdd = useCallback(async () => {
        if (!isConnected || !userAddress || !previewData) {
            Toast.error('Please connect wallet first');
            return;
        }

        try {
            setAddingUsers(true);
            setAddStep(2);

            const params: BatchAllowlistParams = {
                channelId,
                users: previewData.users,
                weights: previewData.weights
            };

            const result = await ContractService.batchAddToAllowlist(params);

            if (result.success) {
                Toast.success({
                    content: `🎉 Successfully added ${previewData.users.length} users to allowlist!`,
                    duration: 3
                });
                // Reset all state
                setShowAddForm(false);
                setAddStep(0);
                setPreviewData(undefined);
                setTableData([{ id: '1', address: '', weight: '100' }]);
                await loadAllowlist(currentPage);
            } else {
                Toast.error(`Add failed: ${result.error || 'Unknown error'}`);
                setAddStep(1); // Back to preview step
            }
        } catch (error) {
            console.error('Add user failed:', error);
            Toast.error(`Add failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setAddStep(1); // Back to preview step
        } finally {
            setAddingUsers(false);
        }
    }, [isConnected, userAddress, channelId, currentPage, loadAllowlist, previewData]);

    // Reset add form
    const resetAddForm = useCallback(() => {
        setShowAddForm(false);
        setAddStep(0);
        setPreviewData(undefined);
        setTableData([{ id: '1', address: '', weight: '100' }]);
    }, []);

    // Handle main modal close
    const handleMainModalClose = useCallback(() => {
        // Reset add form state
        if (showAddForm) {
            resetAddForm();
        }
        onClose();
    }, [showAddForm, resetAddForm, onClose]);

    // Handle remove users
    const handleRemoveUsers = useCallback(async (users: string[]) => {
        if (!isConnected || !userAddress) {
            Toast.error('Please connect wallet first');
            return;
        }

        if (users.length === 0) {
            Toast.error('Please select users to remove');
            return;
        }

        try {
            setRemovingUsers(new Set(users));

            const params: BatchRemoveParams = {
                channelId,
                users
            };

            const result = await ContractService.batchRemoveFromAllowlist(params);

            if (result.success) {
                Toast.success(`Successfully removed ${users.length} users from allowlist!`);
                await loadAllowlist(currentPage);
            } else {
                Toast.error(`Remove failed: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Remove user failed:', error);
            Toast.error(`Remove failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setRemovingUsers(new Set());
        }
    }, [isConnected, userAddress, channelId, currentPage, loadAllowlist]);

    // Refresh data
    const handleRefresh = useCallback(async () => {
        await loadAllowlist(currentPage);
    }, [loadAllowlist, currentPage]);

    // Table column definitions
    const columns = [
        {
            title: 'User Address',
            dataIndex: 'user',
            key: 'user',
            render: (address: string) => (
                <Text code style={{ fontSize: '12px' }}>
                    {address}
                </Text>
            ),
        },
        {
            title: 'Weight',
            dataIndex: 'weight',
            key: 'weight',
            render: (weight: bigint) => (
                <Tag color="blue" size="small">
                    {weight.toString()}
                </Tag>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (record: AllowlistEntry) => (
                <Space>
                    <Button
                        type="tertiary"
                        size="small"
                        icon={<IconDelete />}
                        onClick={() => handleRemoveUsers([record.user])}
                        loading={removingUsers.has(record.user)}
                    >
                        Remove
                    </Button>
                </Space>
            ),
        },
    ];

    // Pagination configuration
    const pagination = {
        currentPage,
        pageSize,
        total: totalCount,
        onPageChange: (page: number) => loadAllowlist(page),
        showSizeChanger: false,
        showQuickJumper: true,
    };

    return (
        <>
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <IconUser />
                        <span>Add Users to Allowlist</span>
                    </div>
                }
                visible={showAddForm}
                onCancel={resetAddForm}
                footer={null}
                width={900}
                style={{ maxHeight: '80vh', zIndex: 1100 }}
                maskClosable={!addingUsers}
                closeOnEsc={!addingUsers}
            >
                        <div style={{ marginBottom: 20 }}>
                            <Steps current={addStep} size="small">
                                <Steps.Step title="Input Information" icon={<IconEdit />} />
                                <Steps.Step title="Preview Confirmation" icon={<IconUser />} />
                                <Steps.Step title="Submitting" icon={<IconCheckCircleStroked />} />
                            </Steps>
                        </div>

                        {addStep === 0 && (
                            <div className="add-users-form">
                                <Card
                                    title="Input User Information"
                                    headerStyle={{ padding: '12px 20px' }}
                                    bodyStyle={{ padding: '20px' }}
                                >
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <Text strong>User List</Text>
                                            <Button
                                                type="primary"
                                                size="small"
                                                icon={<IconPlus />}
                                                onClick={addNewRow}
                                            >
                                                Add Row
                                            </Button>
                                        </div>

                                        <Table
                                            columns={[
                                                {
                                                    title: 'No.',
                                                    width: 60,
                                                    render: (_, __, index) => index + 1
                                                },
                                                {
                                                    title: (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <IconUser size="small" />
                                                            <span>User Address</span>
                                                        </div>
                                                    ),
                                                    dataIndex: 'address',
                                                    render: (value: string, record: UserEntry) => (
                                                        <div>
                                                            <Input
                                                                value={value}
                                                                placeholder="0x742d35Cc6634C0532925a3b8D5c..."
                                                                onChange={(val) => updateTableEntry(record.id, 'address', val)}
                                                                style={{
                                                                    borderColor: record.addressError ? 'var(--semi-color-danger)' : undefined
                                                                }}
                                                            />
                                                            {record.addressError && (
                                                                <Text type="danger" size="small" style={{ display: 'block', marginTop: 4 }}>
                                                                    {record.addressError}
                                                                </Text>
                                                            )}
                                                        </div>
                                                    )
                                                },
                                                {
                                                    title: 'Weight',
                                                    dataIndex: 'weight',
                                                    width: 150,
                                                    render: (value: string, record: UserEntry) => (
                                                        <div>
                                                            <Input
                                                                value={value}
                                                                placeholder="100"
                                                                onChange={(val) => updateTableEntry(record.id, 'weight', val)}
                                                                style={{
                                                                    borderColor: record.weightError ? 'var(--semi-color-danger)' : undefined
                                                                }}
                                                            />
                                                            {record.weightError && (
                                                                <Text type="danger" size="small" style={{ display: 'block', marginTop: 4 }}>
                                                                    {record.weightError}
                                                                </Text>
                                                            )}
                                                        </div>
                                                    )
                                                },
                                                {
                                                    title: 'Actions',
                                                    width: 80,
                                                    render: (_, record: UserEntry) => (
                                                        <Button
                                                            type="tertiary"
                                                            size="small"
                                                            icon={<IconDelete />}
                                                            onClick={() => deleteRow(record.id)}
                                                            disabled={tableData.length === 1}
                                                            style={{
                                                                color: tableData.length === 1 ? 'var(--semi-color-text-3)' : 'var(--semi-color-danger)'
                                                            }}
                                                        />
                                                    )
                                                }
                                            ]}
                                            dataSource={tableData}
                                            pagination={false}
                                            rowKey="id"
                                            size="small"
                                            style={{
                                                border: '1px solid var(--semi-color-border)',
                                                borderRadius: 6
                                            }}
                                        />
                                    </div>

                                    <div style={{
                                        padding: 16,
                                        backgroundColor: 'var(--semi-color-fill-0)',
                                        borderRadius: 8,
                                        marginBottom: 20
                                    }}>
                                        <Text strong size="small" style={{ display: 'block', marginBottom: 8 }}>
                                            📝 Instructions:
                                        </Text>
                                        <Text type="secondary" size="small">
                                            1. Enter Ethereum addresses starting with 0x in the address column<br/>
                                            2. Enter corresponding weight values (positive integers) in the weight column<br/>
                                            3. Click "Add Row" to add more users<br/>
                                            4. Click the delete button to remove that row of users<br/>
                                            5. The system will validate input format in real-time
                                        </Text>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                                        <Button onClick={resetAddForm} disabled={addingUsers}>
                                            Cancel
                                        </Button>
                                        <Button type="primary" onClick={handleFormSubmit} disabled={addingUsers}>
                                            Next
                                        </Button>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {addStep === 1 && previewData && (
                            <div className="preview-form">
                                <Card
                                    title={
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <IconCheckCircleStroked />
                                            <span>Preview Confirmation - About to add {previewData.users.length} users</span>
                                        </div>
                                    }
                                    headerStyle={{ padding: '12px 20px' }}
                                    bodyStyle={{ padding: '20px' }}
                                >
                                    <div style={{
                                        maxHeight: '400px',
                                        overflowY: 'auto',
                                        border: '1px solid var(--semi-color-border)',
                                        borderRadius: 6
                                    }}>
                                        <Table
                                            columns={[
                                                {
                                                    title: '#',
                                                    width: 60,
                                                    render: (_, __, index) => index + 1
                                                },
                                                {
                                                    title: 'User Address',
                                                    dataIndex: 'user',
                                                    render: (address: string) => (
                                                        <Text code style={{ fontSize: '12px' }}>
                                                            {address}
                                                        </Text>
                                                    ),
                                                },
                                                {
                                                    title: 'Weight',
                                                    dataIndex: 'weight',
                                                    width: 100,
                                                    render: (weight: bigint) => (
                                                        <Tag color="blue" size="small">
                                                            {weight.toString()}
                                                        </Tag>
                                                    ),
                                                },
                                            ]}
                                            dataSource={previewData.users.map((user, index) => ({
                                                key: user,
                                                user,
                                                weight: previewData.weights[index]
                                            }))}
                                            pagination={false}
                                            size="small"
                                        />
                                    </div>

                                    <div style={{
                                        marginTop: 16,
                                        padding: 12,
                                        backgroundColor: 'var(--semi-color-success-light-default)',
                                        borderRadius: 6,
                                        border: '1px solid var(--semi-color-success-light-active)'
                                    }}>
                                        <Text size="small" style={{ color: 'var(--semi-color-success)' }}>
                                            ✓ Data validation passed, {previewData.users.length} users total,
                                            Total weight: {previewData.weights.reduce((sum, w) => sum + w, 0n).toString()}
                                        </Text>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
                                        <Button onClick={() => setAddStep(0)} disabled={addingUsers}>
                                            Previous
                                        </Button>
                                        <Button
                                            type="primary"
                                            onClick={handleConfirmAdd}
                                            loading={addingUsers}
                                        >
                                            {addingUsers ? 'Adding...' : 'Confirm Add'}
                                        </Button>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {addStep === 2 && (
                            <div className="loading-form">
                                <Card>
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '40px 20px'
                                    }}>
                                        <Spin size="large" />
                                        <div style={{ marginTop: 16 }}>
                                            <Text>Submitting transaction, please wait...</Text>
                                        </div>
                                        <div style={{ marginTop: 8 }}>
                                            <Text type="tertiary" size="small">
                                                Please confirm the transaction in your wallet
                                            </Text>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        )}
                        <div style={{
                            height:'24px'
                        }}>

                        </div>
                </Modal>

            <Modal
            title="Allowlist Management"
            visible={visible}
            onCancel={handleMainModalClose}
            closeOnEsc={true}
            width={900}
            style={{ maxHeight: '80vh' }}
            footer={
                <Space>
                    <Button onClick={handleMainModalClose}>
                        Close
                    </Button>
                    <Button
                        type="primary"
                        icon={<IconPlus />}
                        onClick={() => {
                            console.log('Click add user button');
                            setShowAddForm(true);
                        }}
                        disabled={!isConnected}
                    >
                        Add User
                    </Button>
                </Space>
            }
        >
            <div className="allowlist-modal">
                {loading && (
                    <div className="loading-container">
                        <Spin size="large" />
                        <Text style={{ marginTop: '16px' }}>Loading allowlist data...</Text>
                    </div>
                )}

                {error && (
                    <div className="error-container">
                        <Text type="danger">Loading failed: {error}</Text>
                        <Button
                            type="tertiary"
                            size="small"
                            icon={<IconRefresh />}
                            onClick={handleRefresh}
                            style={{ marginLeft: '12px' }}
                        >
                            Retry
                        </Button>
                    </div>
                )}

                {!loading && !error && (
                    <div className="allowlist-content">
                        <div className="allowlist-header">
                            <div className="header-info">
                                <Title heading={5} style={{ margin: 0 }}>
                                    Channel Allowlist
                                </Title>
                                <Text type="secondary">
                                    Channel ID: {channelId.toString()} | Total Users: {totalCount}
                                </Text>
                            </div>
                            <Button
                                type="tertiary"
                                icon={<IconRefresh />}
                                onClick={handleRefresh}
                                loading={loading}
                            >
                                Refresh
                            </Button>
                        </div>

                        <Divider margin="16px" />

                        {allowlist.length > 0 ? (
                            <Table
                                columns={columns}
                                dataSource={allowlist}
                                pagination={pagination}
                                rowKey="user"
                                size="small"
                            />
                        ) : (
                            <div className="empty-container">
                                <Text type="secondary">No allowlist users</Text>
                            </div>
                        )}
                    </div>
                )}


            </div>
        </Modal>

        </>
    );
}