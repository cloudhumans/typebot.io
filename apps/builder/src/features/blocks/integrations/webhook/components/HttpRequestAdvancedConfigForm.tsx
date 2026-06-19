import { DropdownList } from '@/components/DropdownList'
import { CodeEditor } from '@/components/inputs/CodeEditor'
import { SwitchWithLabel } from '@/components/inputs/SwitchWithLabel'
import { TableList, TableListItemProps } from '@/components/TableList'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { useToast } from '@/hooks/useToast'
import {
  Stack,
  HStack,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionIcon,
  AccordionPanel,
  Button,
  Text,
  Tag,
  TagLeftIcon,
} from '@chakra-ui/react'
import { LockedIcon } from '@/components/icons'
import { useTranslate } from '@tolgee/react'
import {
  KeyValue,
  VariableForTest,
  ResponseVariableMapping,
  HttpRequest,
  HttpRequestBlock,
} from '@typebot.io/schemas'
import { useState, useMemo } from 'react'
import { executeWebhook } from '../queries/executeWebhookQuery'
import { convertVariablesForTestToVariables } from '../helpers/convertVariablesForTestToVariables'
import { getDeepKeys } from '../helpers/getDeepKeys'
import { QueryParamsInputs, HeadersInputs } from './KeyValueInputs'
import { DataVariableInputs } from './ResponseMappingInputs'
import { VariableForTestInputs } from './VariableForTestInputs'
import { SwitchWithRelatedSettings } from '@/components/SwitchWithRelatedSettings'
import {
  HttpMethod,
  defaultWebhookAttributes,
  defaultWebhookBlockOptions,
} from '@typebot.io/schemas/features/blocks/integrations/webhook/constants'
import { normalizeCredentialsId } from '@typebot.io/schemas/features/blocks/integrations/webhook/credentialsId'

type InheritedKeyValue = { key: string; value: string }

const InheritedEntries = ({
  items,
  label,
}: {
  items?: InheritedKeyValue[]
  label: string
}) => {
  if (!items || items.length === 0) return null
  return (
    <Stack spacing="1">
      <Text fontSize="xs" color="gray.500">
        {label}
      </Text>
      {items.map((item, idx) => (
        <Tag key={`${item.key}-${idx}`} size="md" colorScheme="gray">
          <TagLeftIcon as={LockedIcon} />
          <Text>
            {item.key}: {item.value}
          </Text>
        </Tag>
      ))}
    </Stack>
  )
}

type Props = {
  blockId: string
  webhook: HttpRequest | undefined
  options: HttpRequestBlock['options']
  inheritedHeaders?: InheritedKeyValue[]
  inheritedQueryParams?: InheritedKeyValue[]
  onWebhookChange: (webhook: HttpRequest) => void
  onOptionsChange: (options: HttpRequestBlock['options']) => void
}

export const HttpRequestAdvancedConfigForm = ({
  blockId,
  webhook,
  options,
  inheritedHeaders,
  inheritedQueryParams,
  onWebhookChange,
  onOptionsChange,
}: Props) => {
  const { t } = useTranslate()
  const { typebot, save } = useTypebot()
  const [isTestResponseLoading, setIsTestResponseLoading] = useState(false)
  const [testResponse, setTestResponse] = useState<string>()
  const [responseKeys, setResponseKeys] = useState<string[]>([])
  const { showToast } = useToast()

  const updateMethod = (method: HttpMethod) =>
    onWebhookChange({ ...webhook, method })

  const updateQueryParams = (queryParams: KeyValue[]) =>
    onWebhookChange({ ...webhook, queryParams })

  const updateHeaders = (headers: KeyValue[]) =>
    onWebhookChange({ ...webhook, headers })

  const updateBody = (body: string) => onWebhookChange({ ...webhook, body })

  const updateVariablesForTest = (variablesForTest: VariableForTest[]) =>
    onOptionsChange({ ...options, variablesForTest })

  const updateResponseVariableMapping = (
    responseVariableMapping: ResponseVariableMapping[]
  ) => onOptionsChange({ ...options, responseVariableMapping })

  const updateAdvancedConfig = (isAdvancedConfig: boolean) =>
    onOptionsChange({ ...options, isAdvancedConfig })

  const updateIsCustomBody = (isCustomBody: boolean) =>
    onOptionsChange({ ...options, isCustomBody })

  const executeTestRequest = async () => {
    if (!typebot) return
    setIsTestResponseLoading(true)
    if (!options?.webhook) await save()
    else await save()
    const { data, error } = await executeWebhook(
      typebot.id,
      convertVariablesForTestToVariables(
        options?.variablesForTest ?? [],
        typebot.variables
      ),
      { blockId }
    )
    if (error)
      return showToast({ title: error.name, description: error.message })
    setTestResponse(JSON.stringify(data, undefined, 2))
    setResponseKeys(getDeepKeys(data))
    setIsTestResponseLoading(false)
  }

  const ResponseMappingInputs = useMemo(
    () =>
      function Component(props: TableListItemProps<ResponseVariableMapping>) {
        return <DataVariableInputs {...props} dataItems={responseKeys} />
      },
    [responseKeys]
  )

  const isCustomBody =
    options?.isCustomBody ?? defaultWebhookBlockOptions.isCustomBody

  return (
    <>
      <SwitchWithRelatedSettings
        label="Advanced configuration"
        initialValue={
          options?.isAdvancedConfig ??
          defaultWebhookBlockOptions.isAdvancedConfig
        }
        onCheckChange={updateAdvancedConfig}
      >
        <HStack justify="space-between">
          <Text>Method:</Text>
          <DropdownList
            currentItem={
              (webhook?.method ?? defaultWebhookAttributes.method) as HttpMethod
            }
            onItemSelect={updateMethod}
            items={Object.values(HttpMethod)}
          />
        </HStack>
        <Accordion allowMultiple>
          <AccordionItem>
            <AccordionButton justifyContent="space-between">
              Query params
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel pt="4" as={Stack} spacing="3">
              <InheritedEntries
                items={inheritedQueryParams}
                label={t(
                  'blocks.integrations.httpRequest.inheritedEntries.label'
                )}
              />
              <TableList<KeyValue>
                initialItems={webhook?.queryParams}
                onItemsChange={updateQueryParams}
                addLabel="Add a param"
              >
                {(props) => <QueryParamsInputs {...props} />}
              </TableList>
            </AccordionPanel>
          </AccordionItem>
          <AccordionItem>
            <AccordionButton justifyContent="space-between">
              Headers
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel pt="4" as={Stack} spacing="3">
              <InheritedEntries
                items={inheritedHeaders}
                label={t(
                  'blocks.integrations.httpRequest.inheritedEntries.label'
                )}
              />
              <TableList<KeyValue>
                initialItems={webhook?.headers}
                onItemsChange={updateHeaders}
                addLabel="Add a value"
              >
                {(props) => <HeadersInputs {...props} />}
              </TableList>
            </AccordionPanel>
          </AccordionItem>
          <AccordionItem>
            <AccordionButton justifyContent="space-between">
              Body
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel py={4} as={Stack} spacing="6">
              <SwitchWithLabel
                label="Custom body"
                initialValue={isCustomBody}
                onCheckChange={updateIsCustomBody}
              />
              {isCustomBody && (
                <CodeEditor
                  defaultValue={webhook?.body}
                  lang="json"
                  onChange={updateBody}
                  debounceTimeout={0}
                />
              )}
            </AccordionPanel>
          </AccordionItem>
          <AccordionItem>
            <AccordionButton justifyContent="space-between">
              Variable values for test
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel pt="4">
              <TableList<VariableForTest>
                initialItems={options?.variablesForTest}
                onItemsChange={updateVariablesForTest}
                addLabel="Add an entry"
              >
                {(props) => <VariableForTestInputs {...props} />}
              </TableList>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </SwitchWithRelatedSettings>
      {(webhook?.url || normalizeCredentialsId(options?.credentialsId)) && (
        <Button
          onClick={executeTestRequest}
          colorScheme="blue"
          isLoading={isTestResponseLoading}
        >
          Test the request
        </Button>
      )}
      {testResponse && (
        <CodeEditor isReadOnly lang="json" value={testResponse} />
      )}
      {(testResponse ||
        (options?.responseVariableMapping &&
          options.responseVariableMapping.length > 0)) && (
        <Accordion allowMultiple>
          <AccordionItem>
            <AccordionButton justifyContent="space-between">
              Save in variables
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel pt="4">
              <TableList<ResponseVariableMapping>
                initialItems={options?.responseVariableMapping}
                onItemsChange={updateResponseVariableMapping}
                addLabel="Add an entry"
              >
                {(props) => <ResponseMappingInputs {...props} />}
              </TableList>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}
    </>
  )
}
