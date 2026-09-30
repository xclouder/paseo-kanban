import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { PluginTheme } from '@getpaseo/plugin';
import { defaultThinkingOptionId, type Snapshot } from '../shared/model';
import { modelPresetSchema, type ModelPreset } from '../shared/settings';

type Props = {
  c: PluginTheme['colors']; models: Snapshot['models']; initialPresets: ModelPreset[];
  createId(): string;
  save(presets: ModelPreset[], expected: ModelPreset[]): Promise<ModelPreset[]>;
  onSavingChange?(saving: boolean): void;
};

export function ModelPresets({ c, models, initialPresets, createId, save, onSavingChange }: Props) {
  const [presets, setPresets] = useState(initialPresets);
  const [draft, setDraft] = useState<ModelPreset | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const available = (preset: ModelPreset) => {
    const model = models.find(item => item.id === preset.provider);
    return Boolean(model && (!preset.thinkingOptionId || model.thinkingOptions.some(option => option.id === preset.thinkingOptionId)));
  };
  useEffect(() => {
    if (!draft && !saving) setPresets(current => JSON.stringify(current) === JSON.stringify(initialPresets) ? current : initialPresets);
  }, [initialPresets, draft, saving]);
  const persist = async (next: ModelPreset[]) => {
    setSaving(true); onSavingChange?.(true); setError('');
    try {
      const saved = await save(next, presets); setPresets(saved); setDraft(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); onSavingChange?.(false); }
  };
  const submit = () => {
    const result = modelPresetSchema.safeParse(draft);
    if (!result.success) { setError(result.error.issues[0].message); return; }
    if (!available(result.data)) { setError('请选择可用的模型和 Thinking Mode。'); return; }
    if (presets.some(item => item.id !== result.data.id && item.name.toLocaleLowerCase() === result.data.name.toLocaleLowerCase())) { setError('方案别名不能重复。'); return; }
    void persist([...presets.filter(item => item.id !== result.data.id), result.data]);
  };
  const button = (label: string, action: () => void, active = false, disabled = false, accessibilityLabel = label) => <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: saving || disabled, selected: active }} disabled={saving || disabled} onPress={action} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 7, borderWidth: 1, borderColor: active ? c.accent : c.border, backgroundColor: c.surface1, opacity: saving || disabled ? 0.4 : 1 }}><Text style={{ color: active ? c.accent : c.foreground, fontSize: 12 }}>{label}</Text></Pressable>;
  const wrap = { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as const;
  return <View testID="model-presets" style={{ gap: 10, marginBottom: 20 }}>
    {presets.length === 0 && <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>还没有方案，创建别名即可快速指定模型和 Thinking Mode。</Text>}
    {presets.map(preset => <View key={preset.id} style={{ padding: 10, gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 8 }}>
      <View style={wrap}>
        <Text style={{ flex: 1, color: c.foreground, fontSize: 13, fontWeight: '600' }}>{preset.name}</Text>
        {button('编辑', () => { setDraft({ ...preset }); setError(''); }, false, Boolean(draft), `编辑方案 ${preset.name}`)}
        {button('删除', () => void persist(presets.filter(item => item.id !== preset.id)), false, Boolean(draft), `删除方案 ${preset.name}`)}
      </View>
      <Text style={{ color: available(preset) ? c.foregroundMuted : c.statusWarning, fontSize: 12 }}>{preset.provider} · {preset.thinkingOptionId ?? '模型默认'}{!available(preset) ? ' · 配置已不可用，请编辑方案' : ''}</Text>
    </View>)}
    {!draft && button('新建方案', () => { const model = models[0]; setError(''); setDraft({ id: createId(), name: '', provider: model?.id ?? '', thinkingOptionId: model ? defaultThinkingOptionId(model.thinkingOptions, model.defaultThinkingOptionId) : undefined }); }, false, presets.length >= 100 || models.length === 0)}
    {draft && <View style={{ padding: 12, gap: 10, borderWidth: 1, borderColor: c.border, borderRadius: 8 }}>
      <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>方案别名</Text>
      <TextInput accessibilityLabel="方案别名" editable={!saving} value={draft.name} maxLength={40} placeholder="例如：视觉和推理" placeholderTextColor={c.foregroundMuted} onChangeText={name => setDraft({ ...draft, name })} style={{ color: c.foreground, borderWidth: 1, borderColor: c.border, borderRadius: 7, padding: 10 }} />
      <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>方案模型</Text>
      <View style={wrap}>{models.map(model => <View key={model.id}>{button(`${model.provider} / ${model.label}`, () => setDraft({ ...draft, provider: model.id, thinkingOptionId: defaultThinkingOptionId(model.thinkingOptions, model.defaultThinkingOptionId) }), draft.provider === model.id)}</View>)}</View>
      <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>方案 Thinking Mode</Text>
      <View style={wrap}>
        {button('模型默认', () => setDraft({ ...draft, thinkingOptionId: undefined }), !draft.thinkingOptionId)}
        {models.find(model => model.id === draft.provider)?.thinkingOptions.map(option => <View key={option.id}>{button(option.label, () => setDraft({ ...draft, thinkingOptionId: option.id }), draft.thinkingOptionId === option.id, false, `方案 Thinking Mode ${option.label}`)}</View>)}
      </View>
      <View style={wrap}>{button(saving ? '保存中…' : '保存方案', submit)}{button('取消编辑方案', () => { setDraft(null); setError(''); })}</View>
    </View>}
    {error && <Text accessibilityRole="alert" style={{ color: c.statusDanger, fontSize: 12 }}>{error}</Text>}
  </View>;
}
