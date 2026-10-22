import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react'

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Create Mod Modeler</h1>
        <span className="app-version">Create 6.0.10 · Minecraft 1.21.1</span>
      </header>
      <main className="app-canvas">
        <ReactFlow nodes={[]} edges={[]} colorMode="dark" fitView>
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </main>
    </div>
  )
}
