import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import type { PluginSurfaceProps } from '@getpaseo/plugin/client';
import { useRpc } from '@getpaseo/plugin/client';
import { SettingsAction, SettingsInput, SettingsSection } from '@getpaseo/plugin/client/ui';
import { readKanbanSettings, saveKanbanSettings } from '../shared/contracts';

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function KanbanSettings({ theme }: PluginSurfaceProps) {
  const read = useRpc(readKanbanSettings);
  const save = useRpc(saveKanbanSettings);
  const [savedValue, setSavedValue] = useState<string>();
  const [projectBaseDirectory, setProjectBaseDirectory] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void read({}).then(settings => {
      if (!active) return;
      setSavedValue(settings.projectBaseDirectory);
      setProjectBaseDirectory(settings.projectBaseDirectory);
    }, reason => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [read]);
  if (savedValue === undefined && !error) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={theme.colors.accent} /></View>;
  const dirty = savedValue !== undefined && projectBaseDirectory.trim() !== savedValue;
  const submit = async () => {
    if (saving || !dirty) return;
    setSaving(true); setSaved(false); setError('');
    try {
      const settings = await save({ projectBaseDirectory: projectBaseDirectory.trim() });
      setProjectBaseDirectory(settings.projectBaseDirectory);
      setSavedValue(settings.projectBaseDirectory);
      setSaved(true);
    } catch (reason) { setError(errorText(reason)); }
    finally { setSaving(false); }
  };
  return <ScrollView contentContainerStyle={{ padding: 24 }}>
    <SettingsSection title="新项目" info="新建任务时只需输入项目名，任务看板会在此目录下创建同名目录，并让 Paseo 为它创建工作区。">
      <SettingsInput label="项目基础目录" hint="请填写绝对路径，例如 J:\\ai-ideas 或 /Users/me/projects。留空时仅能选择已有工作区。" initialValue={savedValue ?? ''} placeholder="J:\\projects" disabled={saving} onChangeText={value => { setProjectBaseDirectory(value); setSaved(false); setError(''); }} />
      <SettingsAction label={saved ? '已保存' : '保存项目目录'} hint={dirty ? '有尚未保存的修改。' : undefined} error={error || null} actionLabel={saving ? '正在保存…' : '保存'} disabled={saving || !dirty} onPress={() => void submit()} />
    </SettingsSection>
    {saved && <Text accessibilityRole="alert" style={{ color: theme.colors.statusSuccess, fontSize: 12, marginTop: 12 }}>项目基础目录已保存。</Text>}
  </ScrollView>;
}
