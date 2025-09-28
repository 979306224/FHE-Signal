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
            Toast.error('Invalid file');
            return false;
        }
        if (!realFile.type.startsWith('image/')) {
            Toast.error('Only image files are supported');
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
                onError?.(new Error('Invalid file type'));
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
            logo: values.logo || '' // If no logo, use empty string
        };
        console.log(submitPayload, 'submitPayload');
        
        // Validate at least one payment plan
        if (!tiers || tiers.length === 0) {
            Toast.error('Please configure at least one payment plan');
            setSubmitting(false);
            return;
        }
        

            // Submit this json to ipfs
            const ipfsResult = await PinataService.uploadJson(submitPayload);
            console.log('IPFS upload result:', ipfsResult);

            // Submit to contract
            const contractResult = await ContractService.createChannel(
                ipfsResult.ipfsUri, // Use IPFS URI as channel information
                tiers
            );

            if (contractResult.success) {
                const message = contractResult.channelId 
                    ? `Channel created successfully! Channel ID: ${contractResult.channelId.toString()}`
                    : `Channel created successfully! Transaction hash: ${contractResult.hash}`;
                Toast.success(message);
                
                console.log('Channel creation result:', {
                    channelId: contractResult.channelId?.toString(),
                    hash: contractResult.hash,
                    ipfsUri: ipfsResult.ipfsUri
                });
                
                setVisible(false);
                setTiers([]);
                formApiRef.current?.reset();
                
                // Call success callback
                onSuccess?.();
            } else {
                Toast.error(`Failed to create channel: ${contractResult.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error during channel creation:', error);
            Toast.error(`Failed to create channel: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSubmitting(false);
        }

        // 
    }, [tiers]);


    return <>
        <Modal
            title="Create Channel"
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
                    <Button onClick={handleCancel} disabled={submitting}>Cancel</Button>
                    <Button theme="solid" loading={submitting} onClick={handleSubmit}>
                        Confirm
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
                    label="Channel Name"
                    placeholder="Please enter channel name"
                    rules={[{ required: true, message: 'Please enter channel name' }]}
                />
                <Form.TextArea
                    field="description"
                    label="Channel Description"
                    placeholder="Please enter channel description"
                    autosize={{ minRows: 3 }}
                />
                <Form.Upload
                    field="logoFile"
                    label="Channel Logo (Optional)"
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
                <div className="infoText" >Recommended to use 96x96 images</div>

                <div style={{ marginBottom: 24 }}>
                    <Form.Label text="Subscription Payment Plans" />
                    <SubscriptionPlanSelector
                        tiers={tiers}
                        onChange={setTiers}
                    />
                </div>

            </Form>
        </Modal>
        <Button theme="solid" onClick={handleOpen} type="primary">Create Channel</Button>
    </>
}