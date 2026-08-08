import { MoreInfoTooltip } from '@/components/MoreInfoTooltip'
import { Select } from '@/components/inputs/Select'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  HStack,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react'
import { Sheet } from '../types'

type Props = {
  sheets: Sheet[]
  isLoading: boolean
  sheetId?: string
  onSelectSheetId: (id: string | undefined) => void
}

export const SheetsDropdown = ({
  sheets,
  isLoading,
  sheetId,
  onSelectSheetId,
}: Props) => {
  if (isLoading) return <Input value="Loading..." isDisabled />
  const validSheets = (sheets ?? []).filter((s) => !s.error)
  const invalidSheets = (sheets ?? []).filter((s) => s.error)

  if (validSheets.length === 0 && invalidSheets.length === 0)
    return (
      <HStack>
        <Input value="No sheets found" isDisabled />
        <MoreInfoTooltip>
          Make sure your spreadsheet contains at least a sheet with a header
          row. Also make sure your header row does not contain duplicates.
        </MoreInfoTooltip>
      </HStack>
    )
  return (
    <Stack spacing={2}>
      {validSheets.length > 0 ? (
        <Select
          selectedItem={sheetId}
          items={validSheets.map((s) => ({ label: s.name, value: s.id }))}
          onSelect={onSelectSheetId}
          placeholder={'Select the sheet'}
        />
      ) : (
        <HStack>
          <Input value="No usable sheets found" isDisabled />
          <MoreInfoTooltip>
            Every sheet in this spreadsheet has a header row issue. See the
            details below.
          </MoreInfoTooltip>
        </HStack>
      )}
      {invalidSheets.length > 0 && (
        <Alert status="warning" borderRadius="md" alignItems="flex-start">
          <AlertIcon />
          <Box>
            <AlertTitle fontSize="sm">
              {invalidSheets.length === 1
                ? '1 sheet cannot be used'
                : `${invalidSheets.length} sheets cannot be used`}
            </AlertTitle>
            <AlertDescription fontSize="sm">
              <Text mb={1}>
                Fix the header row (row 1) of these sheets so it has unique,
                non-empty values:
              </Text>
              <Stack spacing={1} pl={4}>
                {invalidSheets.map((s) => (
                  <Text key={s.id}>
                    <Text as="span" fontWeight="semibold">
                      {s.name}
                    </Text>
                    {s.error ? `: ${s.error}` : null}
                  </Text>
                ))}
              </Stack>
            </AlertDescription>
          </Box>
        </Alert>
      )}
    </Stack>
  )
}
