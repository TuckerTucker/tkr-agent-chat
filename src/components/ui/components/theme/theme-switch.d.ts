import { ReactNode } from 'react';

export interface AgentTheme {
  id: string;
  name?: string;
  primaryColor: string;
  primaryForeground?: string;
}

export interface ThemeSwitchProps extends React.HTMLAttributes<HTMLButtonElement> {
  showAgentIndicator?: boolean;
}

export interface AgentThemeSelectorProps extends React.HTMLAttributes<HTMLDivElement> {}

export interface ThemeControlsProps extends React.HTMLAttributes<HTMLDivElement> {}

export interface IconProps {
  className?: string;
}

export function ThemeSwitch(props: ThemeSwitchProps): React.ReactElement;
export function AgentThemeSelector(props: AgentThemeSelectorProps): React.ReactElement;
export function ThemeControls(props: ThemeControlsProps): React.ReactElement;
export function SunIcon(props: IconProps): React.ReactElement;
export function MoonIcon(props: IconProps): React.ReactElement;
