import "./CreateChannelDialog.less"

import { Button, Form, Modal, Toast } from '@douyinfe/semi-ui';
import { IconUpload } from '@douyinfe/semi-icons';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { FormApi } from '@douyinfe/semi-ui/lib/es/form';
import { PinataService, ContractService } from '../services';
import { type TierPrice } from '../types/contracts';
import SubscriptionPlanSelector from './SubscriptionPlanSelector';

type CreateChannelFormValues = {
    name: string;
    description: string;
    logo: string;
    logoFile: any[];
    tiers: TierPrice[];
};

interface CreateChannelDialogProps {
    onSuccess?: () => void;
}

export default function CreateChannelDialog({ onSuccess }: CreateChannelDialogProps) {

    const [visible, setVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [tiers, setTiers] = useState<TierPrice[]>([]);

    const formApiRef = useRef<FormApi<CreateChannelFormValues> | null>(null);

    const extractFileInstance = useCallback((file: unknown): File | null => {
        if (file instanceof File) {
            return file;
        }
        if (file && typeof file === 'object') {
            const candidate = (file as { fileInstance?: File; file?: { fileInstance?: File } }).fileInstance
                ?? (file as { fileInstance?: File; file?: { fileInstance?: File } }).file?.fileInstance;
            if (candidate instanceof File) {
                return candidate;
            }
        }
        return null;
    }, []);

    const handleLogoBeforeUpload = useCallback((file: unknown) => {
        const realFile = extractFileInstance(file);
        if (!realFile) {
            Toast.error('文件无效');
            return false;
        }
        if (!realFile.type.startsWith('image/')) {
            Toast.error('仅支持上传图片文件');
            return false;
        }
        return true;
    }, [extractFileInstance]);

    const handleOpen = useCallback(() => {
        setVisible(true);
        setTiers([]);
        formApiRef.current?.reset();
    }, []);

    const handleCancel = useCallback(() => {
        if (submitting) {
            return;
        }
        setVisible(false);
        setTiers([]);
        formApiRef.current?.reset();
    }, [submitting]);

    const uploadAction = useMemo(() => ({
        customRequest: async ({ file, fileInstance, onProgress, onError, onSuccess }: {
            file: any;
            fileInstance?: File;
            onProgress?: (event: { total: number; loaded: number }) => void;
            onError?: (error: any) => void;
            onSuccess?: (response: unknown, file?: any) => void;
        }) => {
            const realFile = extractFileInstance(fileInstance ?? (file as any)?.fileInstance ?? file);
            if (!realFile) {
                onError?.(new Error('无效的文件类型'));
                return;
            }
            try {
                const result = await PinataService.uploadFile(realFile, percent => {
                    onProgress?.({ total: 100, loaded: percent });
                });
                const uploadFile: any = {
                    uid: file.uid ?? realFile.name,
                    name: realFile.name,
                    status: 'success',
                    url: result.ipfsGatewayUrl,
                    response: result
                };

                formApiRef.current?.setValue('logoFile', [uploadFile]);
                formApiRef.current?.setValue('logo', result.ipfsUri);

                onSuccess?.(result, uploadFile);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Toast.error(message);
                onError?.(error instanceof Error ? error : new Error(String(error)));
            }
        }
    }), [extractFileInstance]);

    const handleSubmit = useCallback(async () => {
        const formApi = formApiRef.current;
        if (!formApi) {
            return;
        }
        try {
        setSubmitting(true);
        const values = await formApi.validate();
        const { logoFile, ...rest } = values;
        const submitPayload = {
            ...rest,
            logo: values.logo || '' // 如果没有logo，使用空字符串
        };
        console.log(submitPayload, 'submitPayload');
        
        // 验证至少有一个付费计划
        if (!tiers || tiers.length === 0) {
            Toast.error('请至少配置一个付费计划');
            setSubmitting(false);
            return;
        }
        

            // 提交这个json到ipfs
            const ipfsResult = await PinataService.uploadJson(submitPayload);
            console.log('IPFS上传结果:', ipfsResult);

            // 提交到合约
            const contractResult = await ContractService.createChannel(
                ipfsResult.ipfsUri, // 使用IPFS URI作为频道信息
                tiers
            );

            if (contractResult.success) {
                const message = contractResult.channelId 
                    ? `频道创建成功！频道ID: ${contractResult.channelId.toString()}`
                    : `频道创建成功！交易哈希: ${contractResult.hash}`;
                Toast.success(message);
                
                console.log('频道创建结果:', {
                    channelId: contractResult.channelId?.toString(),
                    hash: contractResult.hash,
                    ipfsUri: ipfsResult.ipfsUri
                });
                
                setVisible(false);
                setTiers([]);
                formApiRef.current?.reset();
                
                // 调用成功回调
                onSuccess?.();
            } else {
                Toast.error(`创建频道失败: ${contractResult.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('创建频道过程中出错:', error);
            Toast.error(`创建频道失败: ${error instanceof Error ? error.message : '未知错误'}`);
        } finally {
            setSubmitting(false);
        }

        // 
    }, [tiers]);


    return <>
        <Modal
            title="创建频道"
            visible={visible}
            onCancel={handleCancel}
            closeOnEsc={!submitting}
            maskClosable={!submitting}
            fullScreen
            
            bodyStyle={{
                maxHeight: 'calc(90vh - 120px)',
                overflowY: 'auto',
                padding: '24px'
            }}
            footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <Button onClick={handleCancel} disabled={submitting}>取消</Button>
                    <Button theme="solid" loading={submitting} onClick={handleSubmit}>
                        确认
                    </Button>
                </div>
            }
        >
            <Form
                labelPosition="top"
                getFormApi={formApi => (formApiRef.current = formApi as any)}
                initValues={{
                    name: '',
                    description: '',
                    logo: '',
                    logoFile: [] as any[],
                    tiers: [] as TierPrice[]
                }}
            >
                <Form.Input
                    field="name"
                    label="频道名称"
                    placeholder="请输入频道名称"
                    rules={[{ required: true, message: '请输入频道名称' }]}
                />
                <Form.TextArea
                    field="description"
                    label="频道描述"
                    placeholder="请输入频道描述"
                    autosize={{ minRows: 3 }}
                />
                <Form.Upload
                    field="logoFile"
                    label="频道 Logo (可选)"
                    action=""
                    accept="image/*"
                    limit={1}

                    multiple={false}
                    listType="picture"
                    beforeUpload={handleLogoBeforeUpload}
                    {...uploadAction}
                    dragIcon={<IconUpload style={{ fontSize: 24 }} />}
                    onRemove={() => {
                        formApiRef.current?.setValue('logoFile', []);
                        formApiRef.current?.setValue('logo', '');
                    }}
                />
                <div className="infoText" >推荐使用96x96的图片</div>

                <div style={{ marginBottom: 24 }}>
                    <Form.Label text="订阅付费计划" />
                    <SubscriptionPlanSelector
                        tiers={tiers}
                        onChange={setTiers}
                    />
                </div>

            </Form>
        </Modal>
        <Button theme="solid" onClick={handleOpen} type="primary">创建频道</Button>
    </>
}