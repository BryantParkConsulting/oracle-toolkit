import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Printer, Share2, BookOpen, FileText, ChevronRight, Check, ChevronDown } from 'lucide-react';
import type { ArticlePath } from '../App';

interface ContentAreaProps {
  activeArticle: ArticlePath;
}

export default function ContentArea({ activeArticle }: ContentAreaProps) {
  const [markdownContent, setMarkdownContent] = useState<string>('# Loading...');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (activeArticle) {
      const cacheBustedPath = `${activeArticle}?v=${Date.now()}`;
      fetch(cacheBustedPath)
        .then(res => {
          if (!res.ok) throw new Error("Not found");
          return res.text();
        })
        .then(text => {
          // Process markdown to extract title (we skip stripping it here so it renders, or we can strip it)
          // Actually, let's keep the markdown as is, just render it.
          // Handle blockquotes that act as admonitions
          let updatedText = text.replace(/<aside>\s*(?:<aside>)?/g, '\n> ');
          updatedText = updatedText.replace(/(?:<\/aside>)?\s*<\/aside>/g, '\n');
          setMarkdownContent(updatedText);
        })
        .catch(() => setMarkdownContent('# Error loading article.'));
    }
  }, [activeArticle]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayTitle = activeArticle.split('/').pop()?.replace('.md', '').replace(/_/g, ' ') || 'Documentation';

  return (
    <>
      <div className="article-card">
        <div className="bpc-presentation-header kb-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="bpc-pre-title" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.5px' }}>ARTICLE</div>
            <h1 className="bpc-main-title" style={{ fontSize: '2.25rem', margin: 0, color: 'var(--text-primary)' }}>
              {displayTitle}
              <div className="bpc-title-underline" style={{ height: '4px', width: '60px', background: 'var(--accent)', marginTop: '8px', borderRadius: '2px' }}></div>
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignSelf: 'flex-start' }} className="no-print">
            <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', backgroundColor: 'var(--accent-secondary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Printer size={16} /> Print
            </button>
            <button onClick={handleShare} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {copied ? <Check size={16} /> : <Share2 size={16} />} 
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>
        </div>

        <div className="markdown-container" style={{ padding: '20px 0' }}>
          <ReactMarkdown
             remarkPlugins={[remarkGfm]}
             rehypePlugins={[rehypeRaw]}
             components={{
                table: ({node, ...props}) => <div style={{ overflowX: 'auto', width: '100%', margin: '1.5em 0' }}><table {...props} /></div>,
              img: ({node, src, ...props}) => (
                 <img
                   src={src}
                   style={{ maxWidth: '70%', display: 'block', borderRadius: '8px', margin: '30px auto', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 16px rgba(0,0,0,0.06)' }}
                   {...props}
                 />
              ),
              blockquote: ({node, children, ...props}) => {
                const content = (children as any)?.toString() || '';
                const types = [
                  { key: '[!TIP]', label: 'TIP', color: '#10b981', bg: 'rgba(16, 185, 129, 0.05)', icon: <BookOpen size={14} /> },
                  { key: '[!NOTE]', label: 'NOTE', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.05)', icon: <FileText size={14} /> },
                  { key: '[!IMPORTANT]', label: 'IMPORTANT', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.05)', icon: <ChevronRight size={14} /> },
                  { key: '[!WARNING]', label: 'WARNING', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.05)', icon: <Check size={14} /> },
                  { key: '[!CAUTION]', label: 'CAUTION', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.05)', icon: <ChevronDown size={14} /> }
                ];
                const found = types.find(t => content.includes(t.key));
                if (found) {
                   return (
                     <div className={`admonition ${found.label.toLowerCase()}`} style={{ 
                        background: found.bg, borderLeft: `4px solid ${found.color}`, padding: '16px 20px', borderRadius: '8px', margin: '24px 0',
                        color: found.color === '#f59e0b' ? '#92400e' : (found.color === '#ef4444' ? '#991b1b' : (found.color === '#3b82f6' ? '#1e40af' : (found.color === '#10b981' ? '#065f46' : '#5b21b6')))
                     }}>
                        <div style={{ fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                           {found.icon} {found.label}
                        </div>
                        <div style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
                           {children}
                        </div>
                     </div>
                   );
                }
                return <blockquote {...props}>{children}</blockquote>;
              }
            }}
          >
            {markdownContent}
          </ReactMarkdown>
        </div>
      </div>
    </>
  );
}
