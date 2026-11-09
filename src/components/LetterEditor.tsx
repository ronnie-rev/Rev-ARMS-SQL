import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { AlignCenter, AlignLeft, AlignRight, Bold, Heading2, Italic, List, ListOrdered, Redo2, Underline, Undo2 } from 'lucide-react';

/** Rich-text letter editor (TipTap). Loaded lazily — it is only needed when a letter is opened. */
export default function LetterEditor({ html, onChange, resetKey }: { html: string; onChange: (html: string) => void; resetKey: string }) {
  const ed = useEditor({ extensions: [StarterKit, TextAlign.configure({ types: ['heading', 'paragraph'] })], content: html, onUpdate: ({ editor }) => onChange(editor.getHTML()), editorProps: { attributes: { class: 'prose-letter outline-none min-h-[320px] p-4 font-serif text-[14px] leading-relaxed' } } });
  useEffect(() => { if (ed && ed.getHTML() !== html) ed.commands.setContent(html, { emitUpdate: false }); }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ed) return null;
  const B = ({ on, active, title, children }: { on: () => void; active?: boolean; title: string; children: React.ReactNode }) => <button type="button" title={title} aria-label={title} onClick={on} className={'btn btn-sm !px-2 ' + (active ? 'btn-primary' : 'btn-ghost')}>{children}</button>;
  return (
    <div className="panel2 overflow-hidden">
      <div className="flex gap-0.5 flex-wrap p-1.5 border-b hair">
        <B title="Bold" active={ed.isActive('bold')} on={() => ed.chain().focus().toggleBold().run()}><Bold size={14} /></B><B title="Italic" active={ed.isActive('italic')} on={() => ed.chain().focus().toggleItalic().run()}><Italic size={14} /></B><B title="Underline" active={ed.isActive('underline')} on={() => ed.chain().focus().toggleUnderline().run()}><Underline size={14} /></B>
        <B title="Heading" active={ed.isActive('heading')} on={() => ed.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={14} /></B><B title="Bullets" active={ed.isActive('bulletList')} on={() => ed.chain().focus().toggleBulletList().run()}><List size={14} /></B><B title="Numbered" active={ed.isActive('orderedList')} on={() => ed.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></B>
        <B title="Align left" on={() => ed.chain().focus().setTextAlign('left').run()}><AlignLeft size={14} /></B><B title="Center" on={() => ed.chain().focus().setTextAlign('center').run()}><AlignCenter size={14} /></B><B title="Align right" on={() => ed.chain().focus().setTextAlign('right').run()}><AlignRight size={14} /></B>
        <B title="Undo" on={() => ed.chain().focus().undo().run()}><Undo2 size={14} /></B><B title="Redo" on={() => ed.chain().focus().redo().run()}><Redo2 size={14} /></B>
      </div>
      <EditorContent editor={ed} />
    </div>
  );
}
