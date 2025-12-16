import React from 'react'
import { Icon, IconProps } from '@chakra-ui/react'

export const NativeVariablesIcon = (props: IconProps) => (
  <Icon viewBox="0 0 24 24" {...props}>
    {/* Chaves abertas e fechadas */}
    <path
      fill="currentColor"
      d="M8 4C6.9 4 6 4.9 6 6V8C6 8.55 5.55 9 5 9H4C3.45 9 3 9.45 3 10V14C3 14.55 3.45 15 4 15H5C5.55 15 6 15.45 6 16V18C6 19.1 6.9 20 8 20H9V18H8V15.5C8 14.12 7.16 12.94 6 12.5C7.16 11.06 8 9.88 8 8.5V6H9V4H8Z"
    />
    <path
      fill="currentColor"
      d="M16 4V6H17V8.5C17 9.88 17.84 11.06 19 11.5C17.84 12.94 17 14.12 17 15.5V18H16V20H17C18.1 20 19 19.1 19 18V16C19 15.45 19.45 15 20 15H21C21.55 15 22 14.55 22 14V10C22 9.45 21.55 9 21 9H20C19.45 9 19 8.55 19 8V6C19 4.9 18.1 4 17 4H16Z"
    />
    {/* X no centro */}
    <path
      fill="currentColor"
      d="M10.5 10L9 11.5L10.5 13L12 11.5L13.5 13L15 11.5L13.5 10L15 8.5L13.5 7L12 8.5L10.5 7L9 8.5L10.5 10Z"
    />
  </Icon>
)
