// @vitest-environment jsdom
// happy-dom doesn't parse svg tr/td as foreign elements.
import {describe, it, expect, afterEach, beforeEach, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {nextTick, ref} from 'vue'
import {Editor} from '@tiptap/core'
import {createEditorExtensions, parseEditorHTML, type EditorExtensionDeps} from './editorExtensions'

const API_URL = 'http://localhost:3456/api/v1'
window.API_URL = API_URL

const ATTACHMENT_URL = `${API_URL}/tasks/5/attachments/9`

function createEditor(content: string) {
	const holder = document.createElement('div')
	document.body.appendChild(holder)

	let editor: Editor
	const deps: EditorExtensionDeps = {
		t: key => key,
		isEditing: ref(true),
		isEditEnabled: () => true,
		placeholder: '',
		contentHasChanged: ref(false),
		bubbleSave: () => {},
		getEditor: () => editor,
		uploadCallback: undefined,
		uploadAndInsertFiles: () => {},
		loadedAttachments: ref({}),
		attachmentService: {getBlobUrl: vi.fn(async () => 'blob:real-attachment')} as never,
	}

	editor = new Editor({
		element: holder,
		extensions: createEditorExtensions(deps),
		content,
	})

	return {editor, holder}
}

async function settle() {
	await nextTick()
	await new Promise(resolve => setTimeout(resolve, 0))
	await nextTick()
}

beforeEach(() => {
	setActivePinia(createPinia())
})

afterEach(() => {
	document.body.innerHTML = ''
})

describe('CustomImage attachment id', () => {
	it('resolves the blob url for a freshly inserted image', async () => {
		const {editor} = createEditor('<p>hi</p>')

		editor.chain().setImage({src: ATTACHMENT_URL}).run()
		await settle()

		const img = editor.view.dom.querySelector('img')!
		expect(img.getAttribute('data-src')).toBe(ATTACHMENT_URL)
		expect(img.id).toBe('tiptap-image-5-9')
		expect(img.src).toBe('blob:real-attachment')
	})

	it('resolves the blob url for a reloaded stored description', async () => {
		const stored = `<p><img src="#" data-src="${ATTACHMENT_URL}" id="tiptap-image-5-9"></p>`
		const {editor} = createEditor(stored)
		await settle()

		const img = editor.view.dom.querySelector('img')!
		expect(img.id).toBe('tiptap-image-5-9')
		expect(img.src).toBe('blob:real-attachment')
	})

	it('resolves the blob url for a legacy stored description without data-src', async () => {
		const {editor} = createEditor(`<p><img src="${ATTACHMENT_URL}"></p>`)
		await settle()

		const img = editor.view.dom.querySelector('img')!
		expect(img.id).toBe('tiptap-image-5-9')
		expect(img.src).toBe('blob:real-attachment')
	})

	it('does not let a planted id hijack another image\'s blob url', async () => {
		const stored = `<p><img src="https://attacker.example/x.png" id="tiptap-image-5-9">` +
			`<img src="#" data-src="${ATTACHMENT_URL}" id="tiptap-image-5-9"></p>`
		const {editor} = createEditor(stored)
		await settle()

		const [planted, real] = Array.from(editor.view.dom.querySelectorAll('img'))
		expect(planted.id).toBe('')
		expect(planted.src).toBe('https://attacker.example/x.png')
		expect(real.src).toBe('blob:real-attachment')
	})

	it('resolves the blob url independently for two editors with the same attachment', async () => {
		const stored = `<p><img src="#" data-src="${ATTACHMENT_URL}" id="tiptap-image-5-9"></p>`
		const first = createEditor(stored)
		const second = createEditor(stored)
		await settle()

		expect(first.editor.view.dom.querySelector('img')!.src).toBe('blob:real-attachment')
		expect(second.editor.view.dom.querySelector('img')!.src).toBe('blob:real-attachment')
	})

	it('round trips the rendered html', async () => {
		const {editor} = createEditor(`<p><img src="${ATTACHMENT_URL}"></p>`)
		await settle()

		const html = editor.getHTML()
		expect(html).toContain(`data-src="${ATTACHMENT_URL}"`)
		expect(html).toContain('id="tiptap-image-5-9"')

		const reloaded = createEditor(html)
		await settle()
		expect(reloaded.editor.view.dom.querySelector('img')!.src).toBe('blob:real-attachment')
	})
})

describe('CustomTableCell backgroundColor', () => {
	const cell = (color: string) => `<table><tbody><tr><td data-background-color="${color}">x</td></tr></tbody></table>`

	it.each([
		'#fff',
		'#a1b2c3',
		'#a1b2c3d4',
		'rgb(1, 2, 3)',
		'rgba(1, 2, 3, 0.5)',
		'red',
	])('keeps %s', color => {
		const {editor} = createEditor(cell(color))

		const td = editor.view.dom.querySelector('td')!
		expect(td.getAttribute('data-background-color')).toBe(color)
		expect(td.style.backgroundColor).not.toBe('')
		expect(editor.getHTML()).toContain(`data-background-color="${color}"`)
	})

	it.each([
		'red;position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999',
		'url(https://attacker.example/x.png)',
		'red !important',
		'expression(alert(1))',
	])('drops %s', color => {
		const {editor} = createEditor(cell(color))

		const td = editor.view.dom.querySelector('td')!
		expect(td.hasAttribute('data-background-color')).toBe(false)
		expect(td.getAttribute('style') ?? '').not.toContain('position')
		expect(editor.getHTML()).not.toContain('data-background-color')
	})

	it('drops an unsafe value set programmatically', () => {
		const {editor} = createEditor(cell('red'))

		editor.chain().setTextSelection(3).setCellAttribute('backgroundColor', 'red;position:fixed').run()

		expect(editor.getHTML()).not.toContain('position')
		expect(editor.view.dom.querySelector('td')!.getAttribute('style') ?? '').not.toContain('position')
	})
})

describe('table cell spans', () => {
	function spans(html: string) {
		const {editor} = createEditor(html)
		const attrs: {colspan: number, rowspan: number}[] = []
		editor.state.doc.descendants(node => {
			if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
				attrs.push({colspan: node.attrs.colspan, rowspan: node.attrs.rowspan})
			}
		})
		return attrs
	}

	function firstColspanPerTable(editor: Editor) {
		const colspans: number[] = []
		editor.state.doc.descendants(node => {
			if (node.type.name === 'table') {
				colspans.push(node.firstChild!.firstChild!.attrs.colspan)
			}
		})
		return colspans
	}

	it('keeps a normal span', () => {
		expect(spans('<table><tr><td colspan="2" rowspan="3">x</td></tr></table>'))
			.toEqual([{colspan: 2, rowspan: 3}])
	})

	it('keeps tables within the cell budget and drops the grid of later ones', () => {
		// 6000 implied cells each, the second overruns the remaining budget
		const table = `<table><tr>${'<td colspan="100">x</td>'.repeat(30)}</tr></table>`
		const {editor} = createEditor('')
		editor.commands.setContent(parseEditorHTML(editor, table + table))

		expect(firstColspanPerTable(editor)).toEqual([100])
	})

	it.each([
		['a rowspan', '<table><tr><td rowspan="100000000">x</td></tr></table>'],
		['svg table parts', '<svg><tr><td colspan="20000">x</td></tr></svg>'],
	])('drops the grid implied by %s', (_name, html) => {
		const {editor} = createEditor('')
		editor.commands.setContent(parseEditorHTML(editor, html))

		expect(firstColspanPerTable(editor)).toEqual([])
		expect(editor.getText()).toContain('x')
	})
})
