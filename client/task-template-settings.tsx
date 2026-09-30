import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { PluginTheme } from '@getpaseo/plugin';
import { priorityNames } from '../shared/model';
import { customTaskTemplateSchema, type CustomTaskTemplate } from '../shared/settings';

type Props = {
  c: PluginTheme['colors']; initialTemplates: CustomTaskTemplate[]; createId(): string;
  save(templates: CustomTaskTemplate[], expected: CustomTaskTemplate[]): Promise<CustomTaskTemplate[]>;
};

export function TaskTemplateSettings({ c, initialTemplates, createId, save }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [draft, setDraft] = useState<CustomTaskTemplate | null>(null);
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!draft && !saving) setTemplates(current => JSON.stringify(current) === JSON.stringify(initialTemplates) ? current : initialTemplates); }, [initialTemplates, draft, saving]);
  const persist = async (next: CustomTaskTemplate[]) => {
    setSaving(true); setError('');
    try { setTemplates(await save(next, templates)); setDraft(null); setTags(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  };
  const submit = () => {
    const parsedTags = [...new Set(tags.split(',').map(tag => tag.trim()).filter(Boolean))];
    const result = customTaskTemplateSchema.safeParse(draft ? { ...draft, tags: parsedTags } : null);
    if (!result.success) { setError(result.error.issues[0].message); return; }
    if (templates.some(item => item.id !== result.data.id && item.name.toLocaleLowerCase() === result.data.name.toLocaleLowerCase())) { setError('模板名称不能重复。'); return; }
    void persist([...templates.filter(item => item.id !== result.data.id), result.data]);
  };
  const button = (label: string, action: () => void, active = false, disabled = false, accessibilityLabel = label) => <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: saving || disabled, selected: active }} disabled={saving || disabled} onPress={action} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 7, borderWidth: 1, borderColor: active ? c.accent : c.border, backgroundColor: c.surface1, opacity: saving || disabled ? 0.4 : 1 }}><Text style={{ color: active ? c.accent : c.foreground, fontSize: 12 }}>{label}</Text></Pressable>;
  const input = (label: string, value: string, onChangeText: (value: string) => void, multiline = false, maxLength?: number) => <><Text style={{ color: c.foregroundMuted, fontSize: 12 }}>{label}</Text><TextInput accessibilityLabel={label} editable={!saving} value={value} multiline={multiline} maxLength={maxLength} onChangeText={onChangeText} placeholderTextColor={c.foregroundMuted} style={{ color: c.foreground, minHeight: multiline ? 110 : undefined, textAlignVertical: multiline ? 'top' : 'auto', borderWidth: 1, borderColor: c.border, borderRadius: 7, padding: 10 }} /></>;
  const wrap = { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as const;
  return <View testID="task-template-settings" style={{ gap: 10, marginBottom: 20 }}>
    {templates.length === 0 && <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>还没有自定义模板。创建后会显示在新建任务的常用模板列表中。</Text>}
    {templates.map(template => <View key={template.id} style={{ padding: 10, gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 8 }}><View style={wrap}><Text style={{ flex: 1, color: c.foreground, fontSize: 13, fontWeight: '600' }}>{template.name}</Text>{button('编辑', () => { setDraft({ ...template }); setTags(template.tags.join(', ')); setError(''); }, false, Boolean(draft), `编辑任务模板 ${template.name}`)}{button('删除', () => void persist(templates.filter(item => item.id !== template.id)), false, Boolean(draft), `删除任务模板 ${template.name}`)}</View><Text numberOfLines={2} style={{ color: c.foregroundMuted, fontSize: 12 }}>{template.title} · {priorityNames[template.priority]}{template.tags.length ? ` · ${template.tags.join(', ')}` : ''}</Text></View>)}
    {!draft && button('新建任务模板', () => { setDraft({ id: createId(), name: '', title: '', description: '', priority: 'medium', tags: [] }); setTags(''); setError(''); }, false, templates.length >= 100)}
    {draft && <View style={{ padding: 12, gap: 10, borderWidth: 1, borderColor: c.border, borderRadius: 8 }}>
      {input('模板名称', draft.name, name => setDraft({ ...draft, name }), false, 40)}
      {input('默认任务标题', draft.title, title => setDraft({ ...draft, title }), false, 1000)}
      {input('默认任务说明', draft.description, description => setDraft({ ...draft, description }), true, 20000)}
      <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>默认优先级</Text><View style={wrap}>{(['high', 'medium', 'low'] as const).map(priority => button(priorityNames[priority], () => setDraft({ ...draft, priority }), draft.priority === priority))}</View>
      {input('默认标签（逗号分隔）', tags, setTags, false, 500)}
      <View style={wrap}>{button(saving ? '保存中…' : '保存模板', submit)}{button('取消编辑任务模板', () => { setDraft(null); setTags(''); setError(''); })}</View>
    </View>}
    {error && <Text accessibilityRole="alert" style={{ color: c.statusDanger, fontSize: 12 }}>{error}</Text>}
  </View>;
}
