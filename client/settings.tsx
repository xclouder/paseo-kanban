import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import type { PluginSurfaceProps } from '@getpaseo/plugin/client';
import { useRpc } from '@getpaseo/plugin/client';
import { SettingsAction, SettingsInput, SettingsSection } from '@getpaseo/plugin/client/ui';
import { readBoard, readKanbanSettings, saveKanbanSettings } from '../shared/contracts';
import type { Snapshot } from '../shared/model';
import { ModelPresets } from './model-presets';
import { TaskTemplateSettings } from './task-template-settings';

function clientUuid() { return globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, token => { const value = Math.floor(Math.random() * 16); return (token === 'x' ? value : (value & 0x3) | 0x8).toString(16); }); }

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function KanbanSettings({ theme }: PluginSurfaceProps) {
  const read = useRpc(readKanbanSettings);
  const readSnapshot = useRpc(readBoard);
  const save = useRpc(saveKanbanSettings);
  const [snapshot, setSnapshot] = useState<Snapshot>();
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
  useEffect(() => {
    let active = true;
    void readSnapshot({}).then(value => { if (active) setSnapshot(value); }, reason => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [readSnapshot]);
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
    <SettingsSection title="常用任务模板" info="管理新建任务时可快速套用的标题、说明、优先级和标签。套用后仍可修改任务实例。">
      {snapshot ? <TaskTemplateSettings c={theme.colors} initialTemplates={snapshot.store.settings.taskTemplates ?? []} createId={clientUuid} save={async (taskTemplates, expectedTaskTemplates) => {
        try {
          const settings = await save({ taskTemplates, expectedTaskTemplates });
          setSnapshot(current => current ? { ...current, store: { ...current.store, settings } } : current);
          return settings.taskTemplates ?? [];
        } catch (reason) {
          const latest = await readSnapshot({}).catch(() => undefined);
          if (latest) setSnapshot(latest);
          throw reason;
        }
      }} /> : <ActivityIndicator color={theme.colors.accent} />}
    </SettingsSection>
    <SettingsSection title="执行方案" info="集中管理创建任务时可快速套用的模型与 Thinking Mode。">
      {snapshot ? <ModelPresets c={theme.colors} models={snapshot.models} initialPresets={snapshot.store.settings.modelPresets ?? []} createId={clientUuid} save={async (modelPresets, expectedModelPresets) => {
        const settings = await save({ modelPresets, expectedModelPresets });
        setSnapshot(current => current ? { ...current, store: { ...current.store, settings } } : current);
        return settings.modelPresets ?? [];
      }} /> : <ActivityIndicator color={theme.colors.accent} />}
    </SettingsSection>
    <SettingsSection title="新项目" info="新建任务时只需输入项目名，任务看板会在此目录下创建同名目录，并让 Paseo 为它创建工作区。">
      <SettingsInput label="项目基础目录" hint="请填写绝对路径，例如 J:\\ai-ideas 或 /Users/me/projects。留空时仅能选择已有工作区。" initialValue={savedValue ?? ''} placeholder="J:\\projects" disabled={saving} onChangeText={value => { setProjectBaseDirectory(value); setSaved(false); setError(''); }} />
      <SettingsAction label={saved ? '已保存' : '保存项目目录'} hint={dirty ? '有尚未保存的修改。' : undefined} error={error || null} actionLabel={saving ? '正在保存…' : '保存'} disabled={saving || !dirty} onPress={() => void submit()} />
    </SettingsSection>
    {saved && <Text accessibilityRole="alert" style={{ color: theme.colors.statusSuccess, fontSize: 12, marginTop: 12 }}>项目基础目录已保存。</Text>}
  </ScrollView>;
}
