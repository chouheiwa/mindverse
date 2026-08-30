import type { ComponentType } from 'react'
import type { QuestionWorkspaceProps } from './QuestionWorkspace'

export type QuestionWorkspaceLoader = () => Promise<{ default: ComponentType<QuestionWorkspaceProps> }>

export const loadQuestionWorkspace: QuestionWorkspaceLoader = () =>
  import('./QuestionWorkspace').then((module) => ({ default: module.QuestionWorkspace }))
