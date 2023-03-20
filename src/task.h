#ifndef Task_h
#define Task_h
class Task {
    public:
    virtual void startRunning() = 0;
    virtual bool isDone() = 0;
};
#endif