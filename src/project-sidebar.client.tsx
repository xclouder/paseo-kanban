import { createElement, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Icon } from '@getpaseo/plugin/react-native';
import type { PluginTheme } from '@getpaseo/plugin';
import { projectSections, type ProjectAction, type ProjectLayout, type SidebarProject } from './projects.shared';

type Colors = PluginTheme['colors'];
const row = { flexDirection: 'row', alignItems: 'center' } as const;
const projectMime = 'application/x-paseo-sidebar-project';
const groupMime = 'application/x-paseo-sidebar-group';

function Control({ c, label, icon, disabled, onPress }: { c: Colors; label: string; icon: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={{ padding: 6, opacity: disabled ? 0.3 : 1 }}><Icon name={icon} size={13} color={c.foregroundMuted} /></Pressable>;
}

function SortTarget({ web, disabled, c, drag, onProject, onGroup, children }: {
  web: boolean; disabled: boolean; c: Colors; drag?: { kind: 'project' | 'group'; id: string };
  onProject?(id: string): void; onGroup?(id: string): void; children: ReactNode;
}) {
  const [over, setOver] = useState<'insert' | 'group' | null>(null);
  if (!web) return <View>{children}</View>;
  return createElement('div', {
    draggable: Boolean(drag && !disabled),
    style: { borderRadius: 6, boxShadow: over === 'group' ? `inset 0 0 0 2px ${c.accent}` : over === 'insert' ? `inset 0 2px ${c.accent}` : undefined },
    onDragStart: (event: React.DragEvent) => {
      if (!drag || disabled) return;
      event.stopPropagation();
      event.dataTransfer.setData(drag.kind === 'project' ? projectMime : groupMime, drag.id);
      event.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (event: React.DragEvent) => {
      if (disabled || !(onProject && event.dataTransfer.types.includes(projectMime) || onGroup && event.dataTransfer.types.includes(groupMime))) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
      setOver(onGroup && event.dataTransfer.types.includes(projectMime) ? 'group' : 'insert');
    },
    onDragLeave: () => setOver(null),
    onDrop: (event: React.DragEvent) => {
      setOver(null);
      if (disabled) return;
      const project = event.dataTransfer.getData(projectMime), group = event.dataTransfer.getData(groupMime);
      if (project && onProject || group && onGroup) {
        event.preventDefault(); event.stopPropagation();
        if (project && onProject) onProject(project);
        else if (group && onGroup) onGroup(group);
      }
    },
  }, children);
}

export function ProjectSidebar({ c, projects, layout, selected, busy, web, select, count, organize }: {
  c: Colors; projects: SidebarProject[]; layout: ProjectLayout; selected: string; busy: boolean; web: boolean;
  select(id: string): void; count(id: string): number; organize(action: ProjectAction): Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const sections = projectSections(projects, layout);
  const inputStyle = { flex: 1, minWidth: 0, color: c.foreground, backgroundColor: c.surface0, borderWidth: 1, borderColor: c.border, borderRadius: 5, fontSize: 11, padding: 7 };
  const change = async (action: ProjectAction) => {
    setError('');
    const ok = await organize(action);
    if (!ok) setError('保存失败，请重试。');
    return ok;
  };
  const saveName = async () => {
    const name = (rename?.name ?? newName).trim();
    if (!name || name.length > 60) { setError('分组名称需为 1–60 字。'); return; }
    const action: ProjectAction = rename ? { type: 'renameGroup', id: rename.id, name } : { type: 'createGroup', id: `group:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, name };
    if (await change(action)) { setRename(null); setNewName(''); }
  };
  return <View testID="project-sidebar" style={{ gap: 5 }}>
    <View style={{ ...row, justifyContent: 'space-between', marginBottom: 4 }}>
      <Text style={{ color: c.foregroundMuted, fontSize: 11, fontWeight: '600' }}>项目</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={editing ? '完成项目整理' : '整理项目'} onPress={() => { setEditing(!editing); setRename(null); setAssigning(null); setError(''); }}><Text style={{ color: c.accent, fontSize: 11, padding: 6 }}>{editing ? '完成' : '整理'}</Text></Pressable>
    </View>
    {editing && <>
      <Text style={{ color: c.foregroundMuted, fontSize: 10, lineHeight: 16 }}>拖动调整顺序或移入分组，也可使用箭头。更改自动保存。</Text>
      <View style={{ ...row, marginVertical: 5 }}>
        <TextInput accessibilityLabel="新分组名称" placeholder="新分组名称" placeholderTextColor={c.foregroundMuted} value={newName} onChangeText={setNewName} maxLength={60} editable={!busy} style={inputStyle} />
        <Control c={c} icon="Plus" label="新建项目分组" disabled={busy || !newName.trim()} onPress={() => { setRename(null); void change({ type: 'createGroup', id: `group:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, name: newName.trim() }).then(ok => { if (ok) setNewName(''); }); }} />
      </View>
    </>}
    {error ? <Text accessibilityRole="alert" style={{ color: c.statusDanger, fontSize: 11 }}>{error}</Text> : null}
    {sections.map((section, index) => <View key={section.id ?? 'ungrouped'} testID={`project-section-${section.id ?? 'ungrouped'}`} style={{ marginBottom: 5 }}>
      <SortTarget c={c} web={web} disabled={busy} drag={section.id && editing ? { kind: 'group', id: section.id } : undefined}
        onProject={id => { void change({ type: 'moveProject', id, groupId: section.id }); }}
        onGroup={id => { void change({ type: 'moveGroup', id, beforeId: section.id ?? undefined }); }}>
        {(layout.groups.length > 0 || editing) && <View style={{ paddingVertical: 5 }}>
          {rename?.id === section.id ? <View style={row}>
            <TextInput accessibilityLabel="修改分组名称" value={rename.name} onChangeText={name => setRename({ id: rename.id, name })} maxLength={60} editable={!busy} style={inputStyle} />
            <Control c={c} icon="Check" label="保存分组名称" disabled={busy} onPress={() => void saveName()} />
            <Control c={c} icon="X" label="取消修改分组名称" disabled={busy} onPress={() => setRename(null)} />
          </View> : <View style={row}>
            {section.id ? <Pressable accessibilityRole="button" accessibilityLabel={`${section.collapsed ? '展开' : '折叠'}分组 ${section.name}`} accessibilityState={{ expanded: !section.collapsed }} disabled={busy} onPress={() => void change({ type: 'collapseGroup', id: section.id!, collapsed: !section.collapsed })} style={{ ...row, flex: 1, gap: 5, padding: 4 }}>
              <Icon name={section.collapsed ? 'ChevronRight' : 'ChevronDown'} size={12} color={c.foregroundMuted} /><Text numberOfLines={1} style={{ color: c.foregroundMuted, flex: 1, fontSize: 11, fontWeight: '600' }}>{section.name}</Text><Text style={{ color: c.foregroundMuted, fontSize: 10 }}>{section.projects.length}</Text>
            </Pressable> : <Text style={{ color: c.foregroundMuted, fontSize: 11, padding: 4 }}>未分组</Text>}
            {editing && section.id && <Control c={c} icon="Pencil" label={`重命名分组 ${section.name}`} disabled={busy} onPress={() => setRename({ id: section.id!, name: section.name })} />}
          </View>}
          {editing && section.id && <View style={{ ...row, justifyContent: 'flex-end' }}>
            <Control c={c} icon="ArrowUp" label={`上移分组 ${section.name}`} disabled={busy || index === 0} onPress={() => void change({ type: 'moveGroup', id: section.id!, beforeId: layout.groups[index - 1].id })} />
            <Control c={c} icon="ArrowDown" label={`下移分组 ${section.name}`} disabled={busy || index === layout.groups.length - 1} onPress={() => void change({ type: 'moveGroup', id: section.id!, beforeId: layout.groups[index + 2]?.id })} />
            <Control c={c} icon="Trash2" label={`删除分组 ${section.name}，项目移回未分组`} disabled={busy} onPress={() => void change({ type: 'deleteGroup', id: section.id! })} />
          </View>}
        </View>}
      </SortTarget>
      {!section.collapsed && section.projects.map((project, position) => <SortTarget key={project.id} c={c} web={web} disabled={busy} drag={editing ? { kind: 'project', id: project.id } : undefined}
        onProject={id => { if (id !== project.id) void change({ type: 'moveProject', id, groupId: section.id, beforeId: project.id }); }}>
        <View testID={`sidebar-project-${project.id}`} style={{ borderRadius: 7, backgroundColor: selected === project.id ? c.surface2 : 'transparent' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`筛选项目 ${project.name}`} accessibilityState={{ selected: selected === project.id }} onPress={() => select(project.id)} style={{ ...row, gap: 8, padding: 11 }}>
            <Icon name={editing ? 'GripVertical' : 'FolderGit2'} size={14} color={c.foregroundMuted} /><Text numberOfLines={1} style={{ color: c.foreground, flex: 1, fontSize: 12 }}>{project.name}</Text><Text style={{ color: c.foregroundMuted, fontSize: 11 }}>{count(project.id)}</Text>
          </Pressable>
          {editing && <View style={{ ...row, justifyContent: 'flex-end' }}>
            <Control c={c} icon="ArrowUp" label={`上移项目 ${project.name}`} disabled={busy || position === 0} onPress={() => void change({ type: 'moveProject', id: project.id, groupId: section.id, beforeId: section.projects[position - 1].id })} />
            <Control c={c} icon="ArrowDown" label={`下移项目 ${project.name}`} disabled={busy || position === section.projects.length - 1} onPress={() => void change({ type: 'moveProject', id: project.id, groupId: section.id, beforeId: section.projects[position + 2]?.id })} />
            <Control c={c} icon="FolderOpen" label={`设置项目分组 ${project.name}`} disabled={busy} onPress={() => setAssigning(assigning === project.id ? null : project.id)} />
          </View>}
          {editing && assigning === project.id && <View style={{ padding: 5, gap: 2 }}>
            {sections.map(target => <Pressable key={target.id ?? 'ungrouped'} accessibilityRole="button" accessibilityLabel={`将 ${project.name} 移至 ${target.name}`} disabled={busy || section.id === target.id} onPress={() => void change({ type: 'moveProject', id: project.id, groupId: target.id }).then(ok => { if (ok) setAssigning(null); })} style={{ padding: 7, opacity: section.id === target.id ? 0.4 : 1 }}><Text style={{ color: c.accent, fontSize: 11 }}>{target.name}</Text></Pressable>)}
          </View>}
        </View>
      </SortTarget>)}
      {!section.collapsed && !section.projects.length && section.id && <Text style={{ color: c.foregroundMuted, fontSize: 10, padding: 9 }}>空分组 · 将项目拖到分组标题</Text>}
    </View>)}
    {!projects.length && <Text style={{ color: c.foregroundMuted, padding: 10, fontSize: 11 }}>尚无项目</Text>}
  </View>;
}
