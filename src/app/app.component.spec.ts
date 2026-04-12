import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { taskStructureReducer } from './store/task-structure/task-structure.reducer';
import { knowledgeBaseReducer } from './store/knowledge-base/knowledge-base.reducer';
import { ssmReducer } from './store/ssm/ssm.reducer';
import { strategyReducer } from './store/strategy/strategy.reducer';
import { engineReducer } from './store/engine/engine.reducer';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideStore({
          taskStructure: taskStructureReducer,
          knowledgeBase: knowledgeBaseReducer,
          ssm: ssmReducer,
          strategy: strategyReducer,
          engine: engineReducer,
        }),
        provideEffects([]),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render dashboard', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-dashboard')).toBeTruthy();
  });
});
